#!/usr/bin/env python3
"""
Build Trial Record Tabs from Internal Index
Creates 5-item internal index for Trial Record with self-referential links.
"""

import argparse
import re
import json
import os
from typing import Dict, List, Tuple
import fitz  # PyMuPDF
import hashlib

# Regex patterns
TAB_RX = re.compile(r"(?i)\bTAB(?:\s*NO\.?)?\s*(\d{1,3})\b")
MARK_RX = re.compile(r"(?i)\*T(\d{1,3})\b")  # asterisk markers

HEADER_FOOTER_BAND = 0.08

def parse_page_range(page_str: str) -> List[int]:
    """Parse page range string like '2-3' or '2' into list of page numbers."""
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

def extract_tr_index_items(trial_pdf: fitz.Document, index_pages: List[int], expected_tabs: int) -> Tuple[Dict[int, Tuple[int, fitz.Rect]], Dict[int, bool]]:
    """
    Extract Trial Record index items from specified index pages.
    Returns: {item_number: (index_page, rect)}, {item_number: is_marker}
    """
    found_items = {}
    marker_items = {}
    
    print(f"🔍 Scanning TR index pages {index_pages} for {expected_tabs} items")
    
    for page_num in index_pages:
        if page_num > trial_pdf.page_count:
            print(f"⚠️  Page {page_num} exceeds document length ({trial_pdf.page_count} pages)")
            continue
            
        page = trial_pdf[page_num - 1]  # Convert to 0-indexed
        header_band, footer_band = get_page_bands(page)
        bands = [header_band, footer_band]
        
        # Get text lines excluding header/footer
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
                    
                    if not line_text.strip():
                        continue
                    
                    text = line_text.strip()
                    
                    # Check for asterisk markers first
                    marker_match = MARK_RX.search(text)
                    if marker_match:
                        item_num = int(marker_match.group(1))
                        if 1 <= item_num <= 99 and item_num not in found_items:
                            found_items[item_num] = (page_num, line_rect)
                            marker_items[item_num] = True
                            print(f"  ✨ Found TR index marker *T{item_num} on page {page_num}")
                            continue
                    
                    # Check for standard Tab patterns
                    tab_match = TAB_RX.search(text)
                    if tab_match:
                        item_num = int(tab_match.group(1))
                        if 1 <= item_num <= 99 and item_num not in found_items:
                            found_items[item_num] = (page_num, line_rect)
                            marker_items[item_num] = False
                            print(f"  📄 Found TR index Tab {item_num} on page {page_num}")
                    
                    # Also look for numbered items without "Tab" prefix
                    # This catches cases like "1. Section Name" or "Item 1:"
                    number_match = re.search(r'^(\d{1,2})[\.\:\-\s]', text)
                    if number_match:
                        item_num = int(number_match.group(1))
                        if 1 <= item_num <= expected_tabs and item_num not in found_items:
                            found_items[item_num] = (page_num, line_rect)
                            marker_items[item_num] = False
                            print(f"  📋 Found TR index item {item_num} on page {page_num}: {text[:50]}...")
        
        # Stop if we found all expected items
        if len(found_items) >= expected_tabs:
            break
    
    # Validation
    if len(found_items) != expected_tabs:
        if len(found_items) < expected_tabs:
            missing = expected_tabs - len(found_items)
            raise ValueError(f"❌ Expected {expected_tabs} TR index items but found only {len(found_items)} (missing {missing})")
        else:
            extra = len(found_items) - expected_tabs
            print(f"⚠️  Found {extra} extra items beyond expected {expected_tabs}")
    
    print(f"✅ Successfully extracted {len(found_items)} TR index items")
    return found_items, marker_items

def find_tr_section_destinations(trial_pdf: fitz.Document, item_numbers: List[int]) -> Dict[int, int]:
    """
    Find destination pages within Trial Record for each index item.
    Returns: {item_number: destination_page}
    """
    print(f"🎯 Finding TR section destinations for {len(item_numbers)} items")
    
    destinations = {}
    
    # Scan entire Trial Record for section destinations
    for page_num in range(trial_pdf.page_count):
        page = trial_pdf[page_num]
        page_text = page.get_text()
        
        # Check for asterisk markers first
        for marker_match in MARK_RX.finditer(page_text):
            item_num = int(marker_match.group(1))
            if item_num in item_numbers and item_num not in destinations:
                destinations[item_num] = page_num + 1  # 1-indexed
                print(f"  ✨ Found TR section marker *T{item_num} on page {page_num + 1}")
        
        # Check for standard Tab patterns at top of page
        top_text = page.get_text("text", clip=fitz.Rect(page.rect.x0, page.rect.y0, 
                                                       page.rect.x1, page.rect.y0 + page.rect.height * 0.4))
        
        for tab_match in TAB_RX.finditer(top_text):
            item_num = int(tab_match.group(1))
            if item_num in item_numbers and item_num not in destinations:
                destinations[item_num] = page_num + 1  # 1-indexed
                print(f"  📄 Found TR section Tab {item_num} on page {page_num + 1}")
        
        # Look for numbered section headers
        for line in top_text.split('\n'):
            line = line.strip()
            if not line:
                continue
            
            number_match = re.search(r'^(\d{1,2})[\.\:\-\s]', line)
            if number_match:
                item_num = int(number_match.group(1))
                if item_num in item_numbers and item_num not in destinations:
                    destinations[item_num] = page_num + 1  # 1-indexed
                    print(f"  📋 Found TR section {item_num} on page {page_num + 1}: {line[:40]}...")
    
    # Report missing destinations
    missing = set(item_numbers) - set(destinations.keys())
    if missing:
        print(f"⚠️  Missing TR destinations for items: {sorted(missing)}")
    
    print(f"✅ Resolved {len(destinations)}/{len(item_numbers)} TR section destinations")
    return destinations

def create_tr_master_pdf(trial_pdf: fitz.Document,
                        index_items: Dict[int, Tuple[int, fitz.Rect]],
                        destinations: Dict[int, int],
                        marker_info: Dict[int, bool],
                        output_dir: str) -> Dict:
    """Create Trial Record Master PDF with internal hyperlinks."""
    
    # Create Master PDF from Trial Record only
    master = fitz.open()
    master.insert_pdf(trial_pdf)
    
    # Create internal hyperlinks
    links_created = 0
    broken_links = 0
    csv_data = []
    
    print(f"🔗 Creating internal TR hyperlinks...")
    
    for item_num in sorted(index_items.keys()):
        index_page, source_rect = index_items[item_num]
        
        if item_num in destinations:
            dest_page = destinations[item_num] - 1  # Convert to 0-indexed for PyMuPDF
            
            # Validate destination exists
            if dest_page >= len(master):
                broken_links += 1
                print(f"❌ Broken link: Item {item_num} points to page {dest_page + 1} but TR only has {len(master)} pages")
                continue
            
            # Create hyperlink
            source_page = master[index_page - 1]  # Convert to 0-indexed
            link_dict = {
                "kind": fitz.LINK_GOTO,
                "from": source_rect,
                "page": dest_page,
                "zoom": 0
            }
            source_page.insert_link(link_dict)
            links_created += 1
            
            # Store for CSV (using TR page numbers for both source and destination)
            csv_data.append({
                "tab_number": item_num,
                "brief_page": index_page,  # Index page in TR
                "tr_dest_page": destinations[item_num],  # Destination page in TR
                "rect": f"[{source_rect.x0:.2f},{source_rect.y0:.2f},{source_rect.x1:.2f},{source_rect.y1:.2f}]",
                "is_marker": marker_info.get(item_num, False)
            })
            
            marker_text = " (marker)" if marker_info.get(item_num, False) else ""
            print(f"  🔗 TR Item {item_num}{marker_text}: index p.{index_page} → section p.{destinations[item_num]}")
        else:
            broken_links += 1
            print(f"❌ No destination found for TR Item {item_num}")
    
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
        "found_tabs": len(index_items),
        "expected_tabs": len(index_items),
        "links_created": links_created,
        "broken_links": broken_links,
        "success": broken_links == 0,
        "markers_used": sum(1 for is_marker in marker_info.values() if is_marker),
        "validation_hash": generate_validation_hash(csv_data)
    }
    
    validation_path = os.path.join(output_dir, "validation.json")
    with open(validation_path, 'w') as f:
        json.dump(validation_data, f, indent=2)
    
    print(f"\n✅ TR Master PDF created: {master_path}")
    print(f"📊 Internal links created: {links_created}")
    print(f"❌ Broken links: {broken_links}")
    print(f"✨ Markers used: {validation_data['markers_used']}")
    
    return validation_data

def generate_validation_hash(csv_data: List[dict]) -> str:
    """Generate deterministic hash for validation."""
    sorted_data = sorted(csv_data, key=lambda x: x["tab_number"])
    hash_input = json.dumps(sorted_data, sort_keys=True).encode()
    return hashlib.sha256(hash_input).hexdigest()[:16]

def main():
    parser = argparse.ArgumentParser(description="Build Trial Record Internal Index")
    parser.add_argument("--trial", required=True, help="Trial Record PDF path")
    parser.add_argument("--index_pages", required=True, help="Index pages to scan (e.g., '2' or '2-3')")
    parser.add_argument("--expected_tabs", type=int, required=True, help="Expected number of index items")
    parser.add_argument("--out_dir", required=True, help="Output directory")
    parser.add_argument("--index_only", action="store_true", help="Use index-only mode")
    parser.add_argument("--review_json", action="store_true", help="Generate review.json")
    
    args = parser.parse_args()
    
    # Parse page range
    index_pages = parse_page_range(args.index_pages)
    
    print(f"🚀 Building TR internal index for {args.expected_tabs} items")
    print(f"📋 Trial Record: {os.path.basename(args.trial)}")
    print(f"🔍 Index pages: {index_pages}")
    
    # Open Trial Record
    trial_pdf = fitz.open(args.trial)
    
    try:
        # Extract index items from TR index pages
        index_items, marker_info = extract_tr_index_items(trial_pdf, index_pages, args.expected_tabs)
        
        # Find section destinations within TR
        destinations = find_tr_section_destinations(trial_pdf, list(index_items.keys()))
        
        # Create TR Master PDF with internal links
        validation = create_tr_master_pdf(trial_pdf, index_items, destinations, marker_info, args.out_dir)
        
        if validation["success"]:
            print("\n🎉 SUCCESS! TR internal index completed with 0 broken links.")
            return 0
        else:
            print(f"\n⚠️  Completed with {validation['broken_links']} broken links.")
            return 1
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    finally:
        trial_pdf.close()

if __name__ == "__main__":
    exit(main())