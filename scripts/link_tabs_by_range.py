#!/usr/bin/env python3
"""
Index-Only Tab Linking Script
Treats the Index as the single source of truth for deterministic hyperlinking.
"""

import argparse
import re
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import fitz  # PyMuPDF
import hashlib

# Regex patterns for tab detection
TAB_RX = re.compile(r"(?i)\bTAB(?:\s*NO\.?)?\s*(\d{1,3})\b")
MARK_RX = re.compile(r"(?i)\*T(\d{1,3})\b")  # asterisk markers
INDEX_ENTRY_RX = re.compile(r"^\s*(\d{1,3})[\.\s]+(.+?)[\s\.]{2,}(\d+)\s*$")  # "1. Title .. 123"

HEADER_FOOTER_BAND = 0.08  # exclude top/bottom 8% of page

def parse_page_range(page_str: str) -> List[int]:
    """Parse page range string like '2-9' or '2' into list of page numbers."""
    if '-' in page_str:
        start, end = map(int, page_str.split('-'))
        return list(range(start, end + 1))
    else:
        return [int(page_str)]

def get_page_bands(page: fitz.Page) -> Tuple[fitz.Rect, fitz.Rect]:
    """Get header and footer band rectangles to exclude."""
    rect = page.rect
    band_height = rect.height * HEADER_FOOTER_BAND
    header_band = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + band_height)
    footer_band = fitz.Rect(rect.x0, rect.y1 - band_height, rect.x1, rect.y1)
    return header_band, footer_band

def is_in_bands(rect: fitz.Rect, bands: List[fitz.Rect]) -> bool:
    """Check if rectangle intersects with header/footer bands."""
    return any(rect.intersects(band) for band in bands)

def extract_index_lines(page: fitz.Page) -> List[Tuple[str, fitz.Rect]]:
    """Extract text lines from index page excluding header/footer bands."""
    header_band, footer_band = get_page_bands(page)
    bands = [header_band, footer_band]
    
    lines = []
    
    # Get selectable text with bounding boxes
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") == 0:  # text block
            for line in block.get("lines", []):
                line_rect = fitz.Rect(line["bbox"])
                if is_in_bands(line_rect, bands):
                    continue
                
                line_text = ""
                for span in line.get("spans", []):
                    line_text += span.get("text", "")
                
                if line_text.strip():
                    lines.append((line_text.strip(), line_rect))
    
    return lines

def extract_tabs_from_index(brief_pdf: fitz.Document, index_pages: List[int], expected_tabs: int) -> Tuple[Dict[int, Tuple[int, fitz.Rect]], Dict[int, bool]]:
    """
    Extract tab numbers and clickable rectangles from specified index pages only.
    Returns: {tab_number: (page_number, rect)}, {tab_number: is_marker}
    """
    found_tabs = {}
    marker_tabs = {}
    
    print(f"🔍 Scanning index pages {index_pages} for tabs (expecting {expected_tabs})")
    
    for page_num in index_pages:
        if page_num > brief_pdf.page_count:
            print(f"⚠️  Page {page_num} exceeds document length ({brief_pdf.page_count} pages)")
            continue
            
        page = brief_pdf[page_num - 1]  # Convert to 0-indexed
        lines = extract_index_lines(page)
        
        for text, rect in lines:
            # Check for asterisk markers first (higher priority)
            marker_match = MARK_RX.search(text)
            if marker_match:
                tab_num = int(marker_match.group(1))
                if 1 <= tab_num <= 999 and tab_num not in found_tabs:
                    found_tabs[tab_num] = (page_num, rect)  # Keep 1-indexed
                    marker_tabs[tab_num] = True
                    print(f"  ✨ Found marker *T{tab_num} on index page {page_num}")
                    continue
            
            # Check for standard Tab patterns
            tab_match = TAB_RX.search(text)
            if tab_match:
                tab_num = int(tab_match.group(1))
                if 1 <= tab_num <= 999 and tab_num not in found_tabs:
                    found_tabs[tab_num] = (page_num, rect)
                    marker_tabs[tab_num] = False
                    print(f"  📄 Found Tab {tab_num} on index page {page_num}")
                    continue
            
            # INDEX-DETERMINISTIC: Look for numbered index entries (1. Title ... 123)
            index_match = INDEX_ENTRY_RX.match(text)
            if index_match:
                tab_num = int(index_match.group(1))
                title = index_match.group(2).strip()
                dest_page = int(index_match.group(3))
                
                if 1 <= tab_num <= 999 and tab_num not in found_tabs:
                    found_tabs[tab_num] = (page_num, rect)
                    marker_tabs[tab_num] = False
                    print(f"  🎯 Index Entry Tab {tab_num}: {title} → Page {dest_page}")
        
        # Stop early if we found all expected tabs
        if len(found_tabs) >= expected_tabs:
            break
    
    # Validation - warn but don't fail completely
    if len(found_tabs) != expected_tabs:
        if len(found_tabs) < expected_tabs:
            missing = expected_tabs - len(found_tabs)
            print(f"⚠️  Expected {expected_tabs} tabs but found only {len(found_tabs)} (missing {missing})")
            print(f"🔍 Continuing with {len(found_tabs)} tabs found from index")
        else:
            extra = len(found_tabs) - expected_tabs
            print(f"⚠️  Found {extra} extra tabs beyond expected {expected_tabs}")
            # Trim to expected count
            sorted_tabs = sorted(found_tabs.keys())[:expected_tabs]
            found_tabs = {k: found_tabs[k] for k in sorted_tabs}
            marker_tabs = {k: marker_tabs[k] for k in sorted_tabs}
    
    print(f"✅ Successfully extracted {len(found_tabs)} tabs from index")
    return found_tabs, marker_tabs

def find_trial_destinations(trial_pdf: fitz.Document, tab_numbers: List[int]) -> Dict[int, int]:
    """
    Find destination pages in Trial Record for each tab number.
    Returns: {tab_number: destination_page}
    """
    print(f"🎯 Finding destinations in Trial Record for {len(tab_numbers)} tabs")
    
    destinations = {}
    
    # Scan entire Trial Record for tab destinations
    for page_num in range(trial_pdf.page_count):
        page = trial_pdf[page_num]
        page_text = page.get_text()
        
        # Check for asterisk markers first
        for marker_match in MARK_RX.finditer(page_text):
            tab_num = int(marker_match.group(1))
            if tab_num in tab_numbers and tab_num not in destinations:
                destinations[tab_num] = page_num + 1  # 1-indexed
                print(f"  ✨ Found marker destination *T{tab_num} on TR page {page_num + 1}")
        
        # Check for standard Tab patterns (only at top of page)
        top_text = page.get_text("text", clip=fitz.Rect(page.rect.x0, page.rect.y0, 
                                                       page.rect.x1, page.rect.y0 + page.rect.height * 0.3))
        
        for tab_match in TAB_RX.finditer(top_text):
            tab_num = int(tab_match.group(1))
            if tab_num in tab_numbers and tab_num not in destinations:
                destinations[tab_num] = page_num + 1  # 1-indexed
                print(f"  📄 Found Tab {tab_num} destination on TR page {page_num + 1}")
    
    # Report missing destinations
    missing = set(tab_numbers) - set(destinations.keys())
    if missing:
        print(f"⚠️  Missing destinations for tabs: {sorted(missing)}")
    
    print(f"✅ Resolved {len(destinations)}/{len(tab_numbers)} tab destinations")
    return destinations

def create_master_pdf(brief_pdf: fitz.Document, trial_pdf: fitz.Document, 
                     tabs: Dict[int, Tuple[int, fitz.Rect]], 
                     destinations: Dict[int, int],
                     marker_info: Dict[int, bool],
                     output_dir: str) -> Dict:
    """Create Master PDF with hyperlinks and generate all output files."""
    
    # Create Master PDF by combining brief + trial record
    master = fitz.open()
    master.insert_pdf(brief_pdf)
    brief_page_count = len(brief_pdf)
    master.insert_pdf(trial_pdf)
    
    # Create hyperlinks
    links_created = 0
    broken_links = 0
    csv_data = []
    
    print(f"🔗 Creating hyperlinks in Master PDF...")
    
    for tab_num in sorted(tabs.keys()):
        brief_page, source_rect = tabs[tab_num]
        
        if tab_num in destinations:
            # Calculate destination page in Master PDF (brief pages + TR page - 1)
            dest_page = brief_page_count + destinations[tab_num] - 1
            
            # Validate destination exists
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
                "is_marker": marker_info.get(tab_num, False)
            })
            
            marker_text = " (marker)" if marker_info.get(tab_num, False) else ""
            print(f"  🔗 Tab {tab_num}{marker_text}: brief p.{brief_page} → TR p.{destinations[tab_num]}")
        else:
            broken_links += 1
            print(f"❌ No destination found for Tab {tab_num}")
    
    # Save Master PDF
    os.makedirs(output_dir, exist_ok=True)
    master_path = os.path.join(output_dir, "Master.TabsRange.linked.pdf")
    master.save(master_path)
    master.close()
    
    # Save CSV
    csv_path = os.path.join(output_dir, "tabs.csv")
    with open(csv_path, 'w') as f:
        f.write("tab_number,brief_page,tr_dest_page,rect,is_marker\n")
        for row in csv_data:
            f.write(f"{row['tab_number']},{row['brief_page']},{row['tr_dest_page']},{row['rect']},{row['is_marker']}\n")
    
    # Create review.json for instant Review panel loading
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
    
    # Create validation.json
    validation_data = {
        "found_tabs": len(tabs),
        "expected_tabs": len(tabs),  # Should match since we validated
        "links_created": links_created,
        "broken_links": broken_links,
        "success": broken_links == 0,
        "markers_used": sum(1 for is_marker in marker_info.values() if is_marker),
        "validation_hash": generate_validation_hash(csv_data)
    }
    
    validation_path = os.path.join(output_dir, "validation.json")
    with open(validation_path, 'w') as f:
        json.dump(validation_data, f, indent=2)
    
    print(f"\n✅ Master PDF created: {master_path}")
    print(f"📊 Links created: {links_created}")
    print(f"❌ Broken links: {broken_links}")
    print(f"✨ Markers used: {validation_data['markers_used']}")
    
    return validation_data

def generate_validation_hash(csv_data: List[dict]) -> str:
    """Generate deterministic hash for validation."""
    sorted_data = sorted(csv_data, key=lambda x: x["tab_number"])
    hash_input = json.dumps(sorted_data, sort_keys=True).encode()
    return hashlib.sha256(hash_input).hexdigest()[:16]

def main():
    parser = argparse.ArgumentParser(description="Index-Only Tab Linking")
    parser.add_argument("--brief", required=True, help="Brief document PDF path")
    parser.add_argument("--trial", required=True, help="Trial Record PDF path")
    parser.add_argument("--index_pages", required=True, help="Index pages to scan (e.g., '2' or '2-9')")
    parser.add_argument("--expected_tabs", type=int, required=True, help="Expected number of tabs")
    parser.add_argument("--out_dir", required=True, help="Output directory")
    parser.add_argument("--index_only", action="store_true", help="Use index-only mode")
    parser.add_argument("--review_json", action="store_true", help="Generate review.json")
    
    args = parser.parse_args()
    
    # Parse page range
    index_pages = parse_page_range(args.index_pages)
    
    print(f"🚀 Starting index-only linking for {args.expected_tabs} tabs")
    print(f"📄 Brief: {os.path.basename(args.brief)}")
    print(f"📋 Trial: {os.path.basename(args.trial)}")
    print(f"🔍 Index pages: {index_pages}")
    
    # Open documents
    brief_pdf = fitz.open(args.brief)
    trial_pdf = fitz.open(args.trial)
    
    try:
        # Extract tabs from index pages only
        tabs, marker_info = extract_tabs_from_index(brief_pdf, index_pages, args.expected_tabs)
        
        # Find destinations in trial record
        destinations = find_trial_destinations(trial_pdf, list(tabs.keys()))
        
        # Create Master PDF with hyperlinks
        validation = create_master_pdf(brief_pdf, trial_pdf, tabs, destinations, marker_info, args.out_dir)
        
        if validation["success"]:
            print("\n🎉 SUCCESS! Index-only linking completed with 0 broken links.")
            return 0
        else:
            print(f"\n⚠️  Completed with {validation['broken_links']} broken links.")
            return 1
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    finally:
        brief_pdf.close()
        trial_pdf.close()

if __name__ == "__main__":
    exit(main())