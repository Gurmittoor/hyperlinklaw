#!/usr/bin/env python3
"""
Quick Override and Regenerate Links
Allows manual override of any tab's start page and rebuilds the linked PDF
"""
import json
import sys
import argparse
import fitz

def regenerate_links_with_overrides(pdf_in, manifest_path, pdf_out, overrides_path=None, overrides_data=None):
    """Regenerate PDF links with manual overrides"""
    
    # Load manifest
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Read overrides
    overrides = []
    if overrides_path and os.path.exists(overrides_path):
        with open(overrides_path, "r", encoding="utf-8") as f:
            override_data = json.load(f)
            if isinstance(override_data, dict):
                overrides = [override_data]
            else:
                overrides = override_data
    elif overrides_data:
        if isinstance(overrides_data, dict):
            overrides = [overrides_data]
        else:
            overrides = overrides_data

    # Apply overrides
    override_map = {int(o["no"]): int(o["start_page"]) for o in overrides if "no" in o and "start_page" in o}
    
    if override_map:
        print(f"Applying {len(override_map)} overrides...")
        for tab_no, new_page in override_map.items():
            print(f"  Tab {tab_no} → Page {new_page}")

    # Open original and re-apply links
    doc = fitz.open(pdf_in)
    
    try:
        idx = (data.get("index_page_1based") or 1) - 1
        page = doc[idx]

        # Clear existing links on index page
        for link in page.get_links():
            page.delete_link(link)

        # Re-add links with overrides
        links_added = 0
        updated_items = []
        
        for it in data["items"]:
            bbox = it.get("index_bbox")
            if not bbox:
                updated_items.append(it)
                continue
                
            # Use override or original start page
            start_page = override_map.get(int(it["no"]), it.get("start_page"))
            if start_page:
                start_page_0 = start_page - 1  # Convert to 0-based
                
                # Add the link
                link_dict = {
                    "kind": fitz.LINK_GOTO,
                    "page": start_page_0,
                    "to": fitz.Point(0, 0)
                }
                page.insert_link(fitz.Rect(*bbox), link_dict)
                links_added += 1
                
                # Update item data
                updated_item = it.copy()
                updated_item["start_page"] = start_page
                updated_item["found"] = True
                updated_items.append(updated_item)
            else:
                updated_items.append(it)

        # Save updated PDF
        doc.save(pdf_out, incremental=False)
        
        # Update manifest with overrides
        data["items"] = updated_items
        data["links_found"] = len([it for it in updated_items if it.get("found", False)])
        
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"✅ Regenerated PDF with {links_added} hyperlinks")
        print(f"✅ Updated: {pdf_out}")
        print(f"✅ Updated manifest: {manifest_path}")
        
        return True
        
    finally:
        doc.close()

def main():
    parser = argparse.ArgumentParser(description='Regenerate PDF Links with Overrides')
    parser.add_argument('--input', required=True, help='Original input PDF path')
    parser.add_argument('--manifest', required=True, help='Manifest JSON path')
    parser.add_argument('--output', required=True, help='Output linked PDF path')
    parser.add_argument('--overrides', help='Overrides JSON file path (optional)')
    parser.add_argument('--tab-no', type=int, help='Single tab number to override')
    parser.add_argument('--new-page', type=int, help='New start page for single tab override')
    
    args = parser.parse_args()
    
    try:
        # Handle single override via command line
        overrides_data = None
        if args.tab_no and args.new_page:
            overrides_data = [{"no": args.tab_no, "start_page": args.new_page}]
        
        success = regenerate_links_with_overrides(
            args.input, 
            args.manifest, 
            args.output, 
            args.overrides,
            overrides_data
        )
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == "__main__":
    import os
    sys.exit(main())