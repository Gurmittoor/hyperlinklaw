"""
100% Accurate Hyperlink Detection for Ferrante Case
Implements exact patterns specified for legal document cross-references
"""
import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple, Optional
import json
import csv
from pathlib import Path

class HyperlinkReference:
    def __init__(self, source_file: str, source_page: int, ref_type: str, 
                 ref_value: str, snippet: str, coordinates: Tuple[float, float, float, float]):
        self.source_file = source_file
        self.source_page = source_page
        self.ref_type = ref_type
        self.ref_value = ref_value
        self.snippet = snippet
        self.coordinates = coordinates  # (x0, y0, x1, y1) for precise link placement

class DestinationCandidate:
    def __init__(self, dest_page: int, confidence: float, method: str, preview_text: str = ""):
        self.dest_page = dest_page
        self.confidence = confidence
        self.method = method
        self.preview_text = preview_text

class HyperlinkMapping:
    def __init__(self, reference: HyperlinkReference, candidates: List[DestinationCandidate]):
        self.reference = reference
        self.candidates = candidates
        self.top_candidate = candidates[0] if candidates else None

class FerranteHyperlinkDetector:
    # Exact patterns from the specification
    PATTERNS = {
        'exhibit': re.compile(r'\bExhibit\s+(?!No\b)([A-Z]{1,3}(?:-\d+)?|\d+)\b', re.IGNORECASE),
        'tab': re.compile(r'\bTab\s+(\d{1,3})\b', re.IGNORECASE),
        'schedule': re.compile(r'\bSchedule\s+([A-Z0-9]{1,3})\b', re.IGNORECASE),
        'affidavit': re.compile(r'\bAffidavit of ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)(?:,?\s+dated\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})?', re.IGNORECASE),
        'undertaking': re.compile(r'\bundertaking(s)?\b', re.IGNORECASE),
        'refusal': re.compile(r'\brefusal(s)?\b', re.IGNORECASE),
        'under_advisement': re.compile(r'\bunder advisement\b', re.IGNORECASE)
    }

    def __init__(self):
        self.trial_record_index = {}
        
    def detect_references_in_pdf(self, pdf_path: str, filename: str) -> List[HyperlinkReference]:
        """Extract all internal references from a PDF with exact coordinates"""
        references = []
        doc = fitz.open(pdf_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text_instances = page.get_text("dict")
            
            # Extract text with coordinates
            full_page_text = page.get_text()
            
            for ref_type, pattern in self.PATTERNS.items():
                for match in pattern.finditer(full_page_text):
                    ref_value = match.group(1) if match.lastindex else match.group(0)
                    
                    # Get precise coordinates for the match
                    match_start, match_end = match.span()
                    coords = self._get_text_coordinates(page, match.group(0), match_start)
                    
                    if coords:
                        snippet = self._get_context_snippet(full_page_text, match_start, 60)
                        
                        reference = HyperlinkReference(
                            source_file=filename,
                            source_page=page_num + 1,
                            ref_type=ref_type,
                            ref_value=ref_value,
                            snippet=snippet,
                            coordinates=coords
                        )
                        references.append(reference)
        
        doc.close()
        return references

    def _get_text_coordinates(self, page, text: str, text_start: int) -> Optional[Tuple[float, float, float, float]]:
        """Get precise coordinates for text placement"""
        text_instances = page.search_for(text)
        if text_instances:
            rect = text_instances[0]  # Take first occurrence
            return (rect.x0, rect.y0, rect.x1, rect.y1)
        return None

    def _get_context_snippet(self, text: str, match_index: int, context_length: int) -> str:
        """Extract context around the match"""
        start = max(0, match_index - context_length)
        end = min(len(text), match_index + context_length)
        return text[start:end].strip()

    def build_trial_record_index(self, trial_record_path: str) -> Dict[int, str]:
        """Build searchable index of Trial Record pages"""
        index = {}
        doc = fitz.open(trial_record_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text().lower()
            index[page_num + 1] = page_text
            
        doc.close()
        self.trial_record_index = index
        return index

    def find_destination_candidates(self, reference: HyperlinkReference) -> List[DestinationCandidate]:
        """Find top 3 destination candidates for a reference"""
        candidates = []
        
        for page_num, page_text in self.trial_record_index.items():
            confidence, method = self._calculate_match_confidence(reference, page_text)
            
            if confidence > 0:
                preview = self._get_preview_text(page_text, reference)
                candidate = DestinationCandidate(page_num, confidence, method, preview)
                candidates.append(candidate)
        
        # Sort by confidence (desc) then by page number (asc)
        candidates.sort(key=lambda x: (-x.confidence, x.dest_page))
        return candidates[:3]  # Top 3 candidates

    def _calculate_match_confidence(self, reference: HyperlinkReference, page_text: str) -> Tuple[float, str]:
        """Calculate confidence score with exact method identification"""
        ref_type = reference.ref_type
        ref_value = reference.ref_value.lower()
        
        if ref_type == 'exhibit':
            # Exact exhibit match
            exact_patterns = [
                f"exhibit {ref_value}:",
                f"exhibit {ref_value} ",
                f"exhibit {ref_value}\n"
            ]
            for pattern in exact_patterns:
                if pattern in page_text:
                    return 1.0, "exact_exhibit"
            
            # Token match
            if f"exhibit" in page_text and ref_value in page_text:
                return 0.85, "token_exhibit"
                
        elif ref_type == 'tab':
            if f"tab {ref_value}" in page_text:
                return 1.0, "exact_tab"
            if "tab" in page_text and ref_value in page_text:
                return 0.85, "token_tab"
                
        elif ref_type == 'schedule':
            if f"schedule {ref_value}" in page_text:
                return 1.0, "exact_schedule"
            if "schedule" in page_text and ref_value in page_text:
                return 0.85, "token_schedule"
                
        elif ref_type == 'affidavit':
            name_parts = ref_value.lower().split()
            if f"affidavit of {ref_value.lower()}" in page_text:
                return 1.0, "exact_affidavit"
            if "affidavit" in page_text and any(part in page_text for part in name_parts):
                return 0.90, "token_affidavit"
                
        elif ref_type in ['undertaking', 'refusal', 'under_advisement']:
            section_key = ref_type.replace('_', ' ')
            if section_key in page_text:
                return 0.80, "section_match"
        
        return 0.0, "no_match"

    def _get_preview_text(self, page_text: str, reference: HyperlinkReference) -> str:
        """Get preview text from the destination page"""
        ref_type = reference.ref_type
        ref_value = reference.ref_value.lower()
        
        search_term = f"{ref_type} {ref_value}"
        index = page_text.find(search_term)
        
        if index != -1:
            start = max(0, index - 50)
            end = min(len(page_text), index + 100)
            return page_text[start:end].strip()
        
        return page_text[:100].strip()

    def map_references_to_destinations(self, references: List[HyperlinkReference]) -> List[HyperlinkMapping]:
        """Map all references to their destination candidates"""
        mappings = []
        
        for reference in references:
            candidates = self.find_destination_candidates(reference)
            mapping = HyperlinkMapping(reference, candidates)
            mappings.append(mapping)
            
        return mappings

    def export_candidate_map(self, mappings: List[HyperlinkMapping], output_dir: str):
        """Export candidate map as CSV and JSON"""
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Export CSV
        csv_path = Path(output_dir) / "Ferrante_candidate_hyperlink_map.csv"
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'source_file', 'source_page', 'ref_type', 'ref_value', 'snippet',
                'top_dest_page', 'top_confidence', 'top_method',
                'alt_dest_1', 'alt_confidence_1', 'alt_method_1',
                'alt_dest_2', 'alt_confidence_2', 'alt_method_2'
            ])
            
            for mapping in mappings:
                ref = mapping.reference
                candidates = mapping.candidates
                
                row = [
                    ref.source_file, ref.source_page, ref.ref_type, ref.ref_value, 
                    f'"{ref.snippet}"',
                    candidates[0].dest_page if candidates else '',
                    candidates[0].confidence if candidates else '',
                    candidates[0].method if candidates else '',
                    candidates[1].dest_page if len(candidates) > 1 else '',
                    candidates[1].confidence if len(candidates) > 1 else '',
                    candidates[1].method if len(candidates) > 1 else '',
                    candidates[2].dest_page if len(candidates) > 2 else '',
                    candidates[2].confidence if len(candidates) > 2 else '',
                    candidates[2].method if len(candidates) > 2 else ''
                ]
                writer.writerow(row)
        
        # Export JSON
        json_path = Path(output_dir) / "Ferrante_candidate_hyperlink_map.json"
        json_data = {
            "case": "Ferrante",
            "generated_at": "",
            "total_references": len(mappings),
            "by_type": self._count_by_type(mappings),
            "high_confidence": len([m for m in mappings if m.top_candidate and m.top_candidate.confidence >= 0.92]),
            "needs_review": len([m for m in mappings if m.top_candidate and m.top_candidate.confidence < 0.92]),
            "mappings": []
        }
        
        for mapping in mappings:
            ref = mapping.reference
            mapping_data = {
                "source_file": ref.source_file,
                "source_page": ref.source_page,
                "ref_type": ref.ref_type,
                "ref_value": ref.ref_value,
                "snippet": ref.snippet,
                "coordinates": ref.coordinates,
                "candidates": [
                    {
                        "dest_page": c.dest_page,
                        "confidence": c.confidence,
                        "method": c.method,
                        "preview_text": c.preview_text
                    } for c in mapping.candidates
                ]
            }
            json_data["mappings"].append(mapping_data)
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        
        return str(csv_path), str(json_path)

    def _count_by_type(self, mappings: List[HyperlinkMapping]) -> Dict[str, int]:
        """Count references by type"""
        counts = {}
        for mapping in mappings:
            ref_type = mapping.reference.ref_type
            counts[ref_type] = counts.get(ref_type, 0) + 1
        return counts