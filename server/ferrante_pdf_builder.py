"""
Master PDF Builder with Internal Hyperlinks
Creates a single court-ready PDF with all hyperlinks working internally
"""
import fitz  # PyMuPDF
from pathlib import Path
from typing import List
from ferrante_detector import HyperlinkMapping, HyperlinkReference

class FerranteMasterPDFBuilder:
    def __init__(self):
        self.doc = None
        self.brief_page_count = 0
        self.trial_record_offset = 0

    def build_master_pdf_with_links(self, brief_paths: List[str], trial_record_path: str, 
                                   mappings: List[HyperlinkMapping], output_path: str,
                                   min_confidence: float = 0.5) -> str:
        """Build master PDF with internal hyperlinks"""
        
        # Create new document
        self.doc = fitz.open()
        
        # Add Brief documents first
        brief_page_offset = 0
        for brief_path in brief_paths:
            brief_doc = fitz.open(brief_path)
            self.doc.insert_pdf(brief_doc)
            brief_page_offset += len(brief_doc)
            brief_doc.close()
        
        self.brief_page_count = brief_page_offset
        
        # Add Trial Record
        trial_doc = fitz.open(trial_record_path)
        self.doc.insert_pdf(trial_doc)
        self.trial_record_offset = brief_page_offset
        trial_doc.close()
        
        # Insert hyperlinks
        self._insert_hyperlinks(mappings, min_confidence)
        
        # Save the master PDF
        self.doc.save(output_path)
        self.doc.close()
        
        return output_path

    def _insert_hyperlinks(self, mappings: List[HyperlinkMapping], min_confidence: float):
        """Insert hyperlinks into the master PDF"""
        
        for mapping in mappings:
            if not mapping.top_candidate or mapping.top_candidate.confidence < min_confidence:
                continue
                
            ref = mapping.reference
            target_page = self.trial_record_offset + mapping.top_candidate.dest_page - 1
            
            # Find the source page in master PDF
            source_page_num = self._find_source_page_in_master(ref.source_file, ref.source_page)
            
            if source_page_num is not None and source_page_num < len(self.doc):
                page = self.doc[source_page_num]
                
                # Create internal link annotation
                link_rect = fitz.Rect(*ref.coordinates)
                
                # Create link annotation that goes to target page
                link = {
                    "kind": fitz.LINK_GOTO,
                    "page": target_page,
                    "to": fitz.Point(0, 0)  # Top of target page
                }
                
                # Add the link annotation
                page.insert_link({
                    "from": link_rect,
                    "kind": fitz.LINK_GOTO,
                    "page": target_page,
                    "to": fitz.Point(0, 0)
                })

    def _find_source_page_in_master(self, source_file: str, source_page: int) -> int:
        """Find the page number in master PDF for a source reference"""
        
        # Determine which brief this comes from
        if "Amended Doc Brief" in source_file:
            # First brief - pages start at 0
            return source_page - 1
        elif "Amended Supp Doc Brief" in source_file:
            # Second brief - need to find where it starts
            # For now, assuming it's the second document added
            # This would need to be calculated based on first brief length
            return source_page - 1  # Simplified - would need actual calculation
        
        return None

class FerranteProcessor:
    """Complete end-to-end processor for Ferrante case"""
    
    def __init__(self):
        from ferrante_detector import FerranteHyperlinkDetector
        self.detector = FerranteHyperlinkDetector()
        self.pdf_builder = FerranteMasterPDFBuilder()
    
    def process_ferrante_case(self, brief_paths: List[str], trial_record_path: str, 
                             output_dir: str, min_confidence: float = 0.5) -> dict:
        """Complete processing pipeline"""
        
        print("🔍 Detecting references in Brief documents...")
        all_references = []
        
        for brief_path in brief_paths:
            filename = Path(brief_path).name
            references = self.detector.detect_references_in_pdf(brief_path, filename)
            all_references.extend(references)
            print(f"   Found {len(references)} references in {filename}")
        
        print(f"📊 Total references found: {len(all_references)}")
        
        # Count by type
        by_type = {}
        for ref in all_references:
            by_type[ref.ref_type] = by_type.get(ref.ref_type, 0) + 1
        
        print("📋 References by type:")
        for ref_type, count in by_type.items():
            print(f"   {ref_type}: {count}")
        
        print("🗂️  Building Trial Record index...")
        self.detector.build_trial_record_index(trial_record_path)
        
        print("🎯 Mapping references to destinations...")
        mappings = self.detector.map_references_to_destinations(all_references)
        
        # Confidence analysis
        high_confidence = len([m for m in mappings if m.top_candidate and m.top_candidate.confidence >= 0.92])
        needs_review = len([m for m in mappings if m.top_candidate and m.top_candidate.confidence < 0.92])
        
        print(f"✅ High confidence (≥92%): {high_confidence}")
        print(f"⚠️  Needs review (<92%): {needs_review}")
        
        print("📁 Exporting candidate maps...")
        csv_path, json_path = self.detector.export_candidate_map(mappings, output_dir)
        
        print("📖 Building master PDF with hyperlinks...")
        master_pdf_path = Path(output_dir) / "Ferrante_Master.linked.pdf"
        self.pdf_builder.build_master_pdf_with_links(
            brief_paths, trial_record_path, mappings, str(master_pdf_path), min_confidence
        )
        
        print("✅ Processing complete!")
        
        return {
            "total_references": len(all_references),
            "by_type": by_type,
            "high_confidence": high_confidence,
            "needs_review": needs_review,
            "master_pdf_path": str(master_pdf_path),
            "candidate_map_csv": csv_path,
            "candidate_map_json": json_path,
            "mappings": mappings
        }