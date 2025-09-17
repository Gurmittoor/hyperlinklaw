#!/usr/bin/env python3
"""
Index-First Tab Detection System
Implements deterministic tab detection by scanning index pages first,
with support for asterisk markers (*Tn) and exact tab count validation.
"""

import re
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import fitz  # PyMuPDF

# Regex patterns
INDEX_RX = re.compile(r"(?i)\bINDEX\b")
TAB_RX = re.compile(r"(?i)\bTAB(?:\s*NO\.?)?\s*(\d{1,3})\b")
MARK_RX = re.compile(r"(?i)\*T(\d{1,3})\b")  # asterisk markers

# Default configuration
DEFAULT_CONFIG = {
    "scan_first_pages": 10,
    "expected_tabs": 0  # 0 means no validation
}

HEADER_FOOTER_BAND = 0.08  # exclude top/bottom 8% of page

class IndexFirstDetector:
    def __init__(self, config_path: str = "config/linking.json"):
        self.config_path = config_path
        self.config = self._load_config()
        self.marker_spans = {}  # Track marker locations for hiding
        
    def _load_config(self) -> dict:
        """Load linking configuration from JSON file."""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"Warning: Could not load config from {self.config_path}: {e}")
            return {}
    
    def get_document_config(self, filename: str) -> dict:
        """Get configuration for specific document, with fallback to defaults."""
        # Try exact filename match first
        if filename in self.config:
            return {**DEFAULT_CONFIG, **self.config[filename]}
        
        # Try partial filename matching
        for config_filename in self.config:
            if config_filename.lower() in filename.lower() or filename.lower() in config_filename.lower():
                return {**DEFAULT_CONFIG, **self.config[config_filename]}
        
        return DEFAULT_CONFIG
    
    def _get_page_bands(self, page: fitz.Page) -> Tuple[fitz.Rect, fitz.Rect]:
        """Get header and footer band rectangles to exclude."""
        rect = page.rect
        band_height = rect.height * HEADER_FOOTER_BAND
        header_band = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + band_height)
        footer_band = fitz.Rect(rect.x0, rect.y1 - band_height, rect.x1, rect.y1)
        return header_band, footer_band
    
    def _is_in_bands(self, rect: fitz.Rect, bands: List[fitz.Rect]) -> bool:
        """Check if rectangle intersects with header/footer bands."""
        return any(rect.intersects(band) for band in bands)
    
    def _get_index_lines(self, page: fitz.Page) -> List[Tuple[str, fitz.Rect]]:
        """Extract text lines from page excluding header/footer bands."""
        header_band, footer_band = self._get_page_bands(page)
        bands = [header_band, footer_band]
        
        lines = []
        
        # Try selectable text first
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block.get("type") == 0:  # text block
                for line in block.get("lines", []):
                    line_rect = fitz.Rect(line["bbox"])
                    if self._is_in_bands(line_rect, bands):
                        continue
                    
                    line_text = ""
                    for span in line.get("spans", []):
                        line_text += span.get("text", "")
                    
                    if line_text.strip():
                        lines.append((line_text.strip(), line_rect))
        
        # If no selectable text, try OCR (if available)
        if not lines:
            lines = self._get_ocr_lines(page, bands)
        
        return lines
    
    def _get_ocr_lines(self, page: fitz.Page, bands: List[fitz.Rect]) -> List[Tuple[str, fitz.Rect]]:
        """Extract text lines using OCR as fallback."""
        try:
            import pytesseract
            from PIL import Image
            import io
            
            # Rasterize page
            pix = page.get_pixmap(dpi=300, alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            
            # Get OCR data
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT, config="--psm 6")
            
            # Convert to page coordinates
            W, H = img.size
            page_rect = page.rect
            sx, sy = page_rect.width / W, page_rect.height / H
            
            lines = []
            for i, text in enumerate(data["text"]):
                if not text.strip():
                    continue
                    
                conf = int(data.get("conf", [0])[i] or 0)
                if conf < 60:  # Low confidence threshold
                    continue
                
                x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                rect = fitz.Rect(
                    page_rect.x0 + x * sx,
                    page_rect.y0 + y * sy,
                    page_rect.x0 + (x + w) * sx,
                    page_rect.y0 + (y + h) * sy
                )
                
                if not self._is_in_bands(rect, bands):
                    lines.append((text.strip(), rect))
            
            return lines
            
        except ImportError:
            print("Warning: OCR not available, install pytesseract and pillow")
            return []
        except Exception as e:
            print(f"Warning: OCR failed: {e}")
            return []
    
    def extract_tabs_from_index(self, pdf: fitz.Document, filename: str) -> Dict[int, Tuple[int, fitz.Rect]]:
        """
        Extract tab numbers and their clickable rectangles from index pages only.
        Returns: {tab_number: (page_number, rect)}
        """
        config = self.get_document_config(filename)
        first_pages = config["scan_first_pages"]
        expected_tabs = config["expected_tabs"]
        
        found = {}
        marker_found = {}
        self.marker_spans = {}
        
        print(f"🔍 Scanning first {first_pages} pages for tabs in {filename}")
        print(f"📊 Expected tabs: {expected_tabs}")
        
        # Scan index pages
        max_pages = min(first_pages, pdf.page_count)
        for page_num in range(max_pages):
            page = pdf[page_num]
            lines = self._get_index_lines(page)
            
            page_markers = []
            for text, rect in lines:
                # Check for asterisk markers first (higher priority)
                marker_match = MARK_RX.search(text)
                if marker_match:
                    tab_num = int(marker_match.group(1))
                    if 1 <= tab_num <= 999 and tab_num not in found:
                        found[tab_num] = (page_num + 1, rect)  # 1-indexed page
                        marker_found[tab_num] = True
                        page_markers.append((tab_num, rect))
                        print(f"  ✨ Found marker *T{tab_num} on page {page_num + 1}")
                        continue
                
                # Check for standard Tab patterns
                tab_match = TAB_RX.search(text)
                if tab_match:
                    tab_num = int(tab_match.group(1))
                    if 1 <= tab_num <= 999 and tab_num not in found:
                        found[tab_num] = (page_num + 1, rect)
                        marker_found[tab_num] = False
                        print(f"  📄 Found Tab {tab_num} on page {page_num + 1}")
            
            # Store marker locations for hiding later
            if page_markers:
                self.marker_spans[page_num] = page_markers
            
            # Stop early if we found all expected tabs
            if expected_tabs > 0 and len(found) >= expected_tabs:
                break
        
        # Validation
        if expected_tabs > 0:
            if len(found) < expected_tabs:
                missing = expected_tabs - len(found)
                raise ValueError(f"❌ Expected {expected_tabs} tabs but found only {len(found)} (missing {missing})")
            elif len(found) > expected_tabs:
                extra = len(found) - expected_tabs
                print(f"⚠️  Found {extra} extra tabs beyond expected {expected_tabs}")
        
        print(f"✅ Successfully extracted {len(found)} tabs from index")
        
        # Store marker info for review panel
        self.marker_info = {tab_num: marker_found.get(tab_num, False) for tab_num in found.keys()}
        
        return found
    
    def resolve_destinations(self, trial_record: fitz.Document, tab_numbers: List[int]) -> Dict[int, int]:
        """
        Find destination pages in Trial Record for each tab number.
        Returns: {tab_number: destination_page}
        """
        print(f"🎯 Resolving destinations for {len(tab_numbers)} tabs in Trial Record")
        
        destinations = {}
        
        # Scan entire Trial Record for tab destinations
        for page_num in range(trial_record.page_count):
            page = trial_record[page_num]
            page_text = page.get_text()
            
            # Check for asterisk markers first
            for marker_match in MARK_RX.finditer(page_text):
                tab_num = int(marker_match.group(1))
                if tab_num in tab_numbers and tab_num not in destinations:
                    destinations[tab_num] = page_num + 1  # 1-indexed
                    print(f"  ✨ Found marker destination *T{tab_num} on page {page_num + 1}")
            
            # Check for standard Tab patterns (only at top of page to avoid false positives)
            top_text = page.get_text("text", clip=fitz.Rect(page.rect.x0, page.rect.y0, 
                                                           page.rect.x1, page.rect.y0 + page.rect.height * 0.2))
            
            for tab_match in TAB_RX.finditer(top_text):
                tab_num = int(tab_match.group(1))
                if tab_num in tab_numbers and tab_num not in destinations:
                    destinations[tab_num] = page_num + 1  # 1-indexed
                    print(f"  📄 Found Tab {tab_num} destination on page {page_num + 1}")
        
        # Check for missing destinations
        missing = set(tab_numbers) - set(destinations.keys())
        if missing:
            print(f"⚠️  Missing destinations for tabs: {sorted(missing)}")
        
        print(f"✅ Resolved {len(destinations)}/{len(tab_numbers)} tab destinations")
        return destinations
    
    def hide_markers(self, master_pdf: fitz.Document, output_path: str):
        """
        Hide asterisk markers in the Master PDF by drawing white overlays.
        Keeps markers.json for potential restoration.
        """
        if not self.marker_spans:
            print("ℹ️  No markers to hide")
            return
        
        print(f"🎭 Hiding {sum(len(spans) for spans in self.marker_spans.values())} markers")
        
        marker_map = {}
        
        for page_num, markers in self.marker_spans.items():
            page = master_pdf[page_num]
            page_markers = []
            
            for tab_num, rect in markers:
                # Draw white overlay to hide marker
                page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), width=0)
                page_markers.append({
                    "tab_number": tab_num,
                    "rect": [rect.x0, rect.y0, rect.x1, rect.y1]
                })
            
            if page_markers:
                marker_map[page_num + 1] = page_markers  # 1-indexed for JSON
        
        # Save marker map for potential restoration
        markers_file = os.path.join(os.path.dirname(output_path), "markers.json")
        with open(markers_file, 'w') as f:
            json.dump(marker_map, f, indent=2)
        
        print(f"💾 Saved marker map to {markers_file}")
    
    def build_master_pdf(self, brief_path: str, trial_record_path: str, output_dir: str) -> dict:
        """
        Main function to build Master PDF with hyperlinks using index-first detection.
        Returns validation report.
        """
        os.makedirs(output_dir, exist_ok=True)
        
        brief_filename = os.path.basename(brief_path)
        print(f"🚀 Starting index-first linking for: {brief_filename}")
        
        # Open documents
        brief = fitz.open(brief_path)
        trial_record = fitz.open(trial_record_path)
        
        try:
            # Extract tabs from index pages
            tabs = self.extract_tabs_from_index(brief, brief_filename)
            
            if not tabs:
                raise ValueError("❌ No tabs found in index pages")
            
            # Resolve destinations in Trial Record
            destinations = self.resolve_destinations(trial_record, list(tabs.keys()))
            
            # Create Master PDF
            master = fitz.open()
            master.insert_pdf(brief)  # Insert brief first
            brief_page_count = len(brief)
            master.insert_pdf(trial_record)  # Then trial record
            
            # Create hyperlinks
            links_created = 0
            broken_links = 0
            csv_data = []
            
            for tab_num in sorted(tabs.keys()):
                brief_page, source_rect = tabs[tab_num]
                
                if tab_num in destinations:
                    # Adjust destination page number for Master PDF (brief pages + trial record page - 1)
                    dest_page = brief_page_count + destinations[tab_num] - 1
                    
                    # Validate destination page exists
                    if dest_page >= len(master):
                        broken_links += 1
                        print(f"❌ Broken link: Tab {tab_num} points to page {dest_page} but Master PDF only has {len(master)} pages")
                        continue
                    
                    # Create hyperlink
                    source_page = master[brief_page - 1]  # Convert to 0-indexed
                    link_dict = {
                        "kind": fitz.LINK_GOTO,
                        "from": source_rect,
                        "page": dest_page,
                        "zoom": 0
                    }
                    source_page.insert_link(link_dict)
                    links_created += 1
                    
                    # Store for CSV
                    csv_data.append({
                        "tab_number": tab_num,
                        "brief_page": brief_page,
                        "tr_dest_page": destinations[tab_num],
                        "rect": f"[{source_rect.x0:.2f},{source_rect.y0:.2f},{source_rect.x1:.2f},{source_rect.y1:.2f}]",
                        "is_marker": self.marker_info.get(tab_num, False)
                    })
                    
                    print(f"  🔗 Linked Tab {tab_num}: page {brief_page} → TR page {destinations[tab_num]}")
                else:
                    broken_links += 1
                    print(f"❌ No destination found for Tab {tab_num}")
            
            # Save Master PDF
            master_path = os.path.join(output_dir, "Master.TabsRange.linked.pdf")
            
            # Hide markers before saving
            self.hide_markers(master, master_path)
            
            master.save(master_path)
            master.close()
            
            # Save CSV
            csv_path = os.path.join(output_dir, "tabs.csv")
            with open(csv_path, 'w') as f:
                f.write("tab_number,brief_page,tr_dest_page,rect,is_marker\\n")
                for row in csv_data:
                    f.write(f"{row['tab_number']},{row['brief_page']},{row['tr_dest_page']},{row['rect']},{row['is_marker']}\\n")
            
            # Create review.json for instant review panel
            review_data = {
                "ok": True,
                "total": len(csv_data),
                "pdfUrl": f"/out/{os.path.basename(output_dir)}/Master.TabsRange.linked.pdf",
                "links": [
                    {
                        "tab_number": row["tab_number"],
                        "brief_page": row["brief_page"],
                        "tr_dest_page": row["tr_dest_page"],
                        "rect": row["rect"],
                        "is_marker": row["is_marker"]
                    }
                    for row in csv_data
                ]
            }
            
            review_path = os.path.join(output_dir, "review.json")
            with open(review_path, 'w') as f:
                json.dump(review_data, f, indent=2)
            
            # Create validation report
            config = self.get_document_config(brief_filename)
            expected_tabs = config["expected_tabs"]
            
            validation_report = {
                "found_tabs": len(tabs),
                "expected_tabs": expected_tabs,
                "links_created": links_created,
                "broken_links": broken_links,
                "success": broken_links == 0 and (expected_tabs == 0 or len(tabs) == expected_tabs),
                "markers_used": sum(1 for is_marker in self.marker_info.values() if is_marker),
                "validation_hash": self._generate_hash(csv_data)
            }
            
            validation_path = os.path.join(output_dir, "validation.json")
            with open(validation_path, 'w') as f:
                json.dump(validation_report, f, indent=2)
            
            print(f"\\n✅ Master PDF created: {master_path}")
            print(f"📊 Links created: {links_created}")
            print(f"❌ Broken links: {broken_links}")
            print(f"✨ Markers used: {validation_report['markers_used']}")
            
            return validation_report
            
        finally:
            brief.close()
            trial_record.close()
    
    def _generate_hash(self, csv_data: List[dict]) -> str:
        """Generate deterministic hash for validation."""
        import hashlib
        
        # Sort data for deterministic hash
        sorted_data = sorted(csv_data, key=lambda x: x["tab_number"])
        hash_input = json.dumps(sorted_data, sort_keys=True).encode()
        return hashlib.sha256(hash_input).hexdigest()[:16]


def main():
    """Command line interface for testing."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Index-First Tab Detection System")
    parser.add_argument("--brief", required=True, help="Brief document PDF path")
    parser.add_argument("--trial", required=True, help="Trial Record PDF path") 
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--config", help="Config file path", default="config/linking.json")
    
    args = parser.parse_args()
    
    detector = IndexFirstDetector(args.config)
    report = detector.build_master_pdf(args.brief, args.trial, args.output)
    
    if report["success"]:
        print("\\n🎉 Success! All validations passed.")
    else:
        print("\\n⚠️  Some validations failed. Check the report.")
    
    return 0 if report["success"] else 1


if __name__ == "__main__":
    exit(main())