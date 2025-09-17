#!/usr/bin/env python3
"""
Internal PDF Hyperlink Generator for HyperlinkLaw
Adds clickable links on Index page and BACK TO INDEX banners on destination pages
"""

import sys
import io
import re
from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter
from PyPDF2.generic import DictionaryObject, NameObject, NumberObject, ArrayObject, FloatObject
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

def get_supp_mapping(reader, patterns=(r"\bSupp\s*(\d+)\b", r"\bDoc\s*(\d+)\b", r"\bTab\s*(\d+)\b")):
    """Extract tab-to-page mapping from PDF bookmarks"""
    try:
        outline = reader.outline
    except Exception:
        return {}
    
    mapping = {}
    for obj in outline:
        title = getattr(obj, "title", str(obj))
        for pattern in patterns:
            match = re.search(pattern, title, re.I)
            if match:
                num = int(match.group(1))
                mapping[num] = reader.get_destination_page_number(obj) + 1
    return mapping

def add_link_annotation(writer, src_page_num, rect, dest_page_num):
    """Add clickable link annotation to a PDF page"""
    page = writer.pages[src_page_num - 1]
    dest_ref = writer.pages[dest_page_num - 1].indirect_reference
    dest = ArrayObject([dest_ref, NameObject("/Fit")])
    
    annotation = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Link"),
        NameObject("/Rect"): ArrayObject([
            FloatObject(rect[0]), FloatObject(rect[1]), 
            FloatObject(rect[2]), FloatObject(rect[3])
        ]),
        NameObject("/Border"): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(0)]),
        NameObject("/Dest"): dest
    })
    
    if "/Annots" in page:
        page["/Annots"].append(annotation)
    else:
        page[NameObject("/Annots")] = ArrayObject([annotation])

def create_banner_overlay(width, height, text="BACK TO INDEX — CLICK HERE"):
    """Create a banner overlay page with the back to index text"""
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=(width, height))
    
    # Banner dimensions
    banner_height = 0.45 * inch
    
    # Draw banner background
    c.setFillGray(0.95)
    c.rect(0, height - banner_height, width, banner_height, fill=1, stroke=0)
    
    # Add border
    c.setStrokeGray(0.7)
    c.setLineWidth(1)
    c.line(0, height - banner_height, width, height - banner_height)
    
    # Draw text
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, height - banner_height / 2 - 5, text)
    
    c.save()
    packet.seek(0)
    
    banner_reader = PdfReader(packet)
    return banner_reader.pages[0], banner_height

def add_internal_hyperlinks(src_pdf_path, out_pdf_path, index_page=2, tab_count=13, custom_mapping=None, custom_mapping_file=None):
    """
    Add internal hyperlinks to PDF with BACK TO INDEX banners
    
    Args:
        src_pdf_path: Input PDF file path
        out_pdf_path: Output PDF file path  
        index_page: Page number containing the index (default: 2)
        tab_count: Number of tabs to process (default: 13)
        custom_mapping: Dict mapping tab numbers to page numbers
    """
    
    print(f"🔗 Processing PDF: {src_pdf_path}")
    print(f"📋 Index page: {index_page}, Tabs: {tab_count}")
    
    # Read source PDF
    reader = PdfReader(src_pdf_path)
    writer = PdfWriter()
    
    # Copy all pages to writer
    for page in reader.pages:
        writer.add_page(page)
    
    # Get page dimensions
    media_box = writer.pages[index_page - 1].mediabox
    page_width = float(media_box.width)
    page_height = float(media_box.height)
    
    print(f"📐 Page dimensions: {page_width:.1f} x {page_height:.1f}")
    
    # Use custom mapping file first, then custom mapping, then try to extract from bookmarks
    if custom_mapping_file:
        import json
        try:
            with open(custom_mapping_file, 'r') as f:
                tab_mapping = {int(k): int(v) for k, v in json.load(f).items()}
            print(f"📋 Using custom tab mapping from file: {tab_mapping}")
        except Exception as e:
            print(f"⚠️  Error loading custom mapping file: {e}")
            tab_mapping = {}
    elif custom_mapping:
        tab_mapping = custom_mapping
        print(f"📋 Using custom tab mapping: {tab_mapping}")
    else:
        tab_mapping = get_supp_mapping(reader)
        print(f"📋 Extracted tab mapping from bookmarks: {tab_mapping}")
    
    # Default mapping for 403-page file based on requirements
    if not tab_mapping:
        tab_mapping = {
            1: 3, 2: 8, 3: 11, 4: 13, 5: 16,
            6: 283, 7: 288, 8: 305, 9: 322, 10: 332,
            11: 346, 12: 351, 13: 403
        }
        print(f"📋 Using default 403-page mapping: {tab_mapping}")
    
    # Define clickable rectangles on index page
    # These coordinates may need adjustment based on your specific PDF layout
    left_margin = 0.8 * inch
    right_margin = page_width - 0.8 * inch
    top_start = page_height - 1.55 * inch
    row_height = 0.43 * inch
    row_spacing = 0.56 * inch
    
    # Add clickable links on index page
    links_added = 0
    for i in range(tab_count):
        tab_num = i + 1
        dest_page = tab_mapping.get(tab_num)
        
        if dest_page and dest_page <= len(reader.pages):
            # Calculate rectangle position
            y_top = top_start - (i * row_spacing)
            y_bottom = y_top - row_height
            rect = (left_margin, y_bottom, right_margin, y_top)
            
            # Add link annotation
            add_link_annotation(writer, index_page, rect, dest_page)
            links_added += 1
            print(f"✅ Added link: Tab {tab_num} -> Page {dest_page}")
        else:
            print(f"⚠️  Skipped Tab {tab_num}: destination page {dest_page} not found")
    
    # Add BACK TO INDEX banners on destination pages
    banner_overlay, banner_height = create_banner_overlay(page_width, page_height)
    banners_added = 0
    
    for tab_num, dest_page in tab_mapping.items():
        if dest_page and dest_page <= len(reader.pages):
            # Merge banner overlay onto destination page
            dest_page_obj = writer.pages[dest_page - 1]
            dest_page_obj.merge_page(banner_overlay)
            
            # Add clickable area for banner (back to index)
            banner_rect = (
                0.3 * inch, 
                page_height - banner_height, 
                page_width - 0.3 * inch, 
                page_height - 2
            )
            add_link_annotation(writer, dest_page, banner_rect, index_page)
            banners_added += 1
            print(f"✅ Added banner: Page {dest_page} -> Back to Index")
    
    # Write output PDF
    with open(out_pdf_path, "wb") as output_file:
        writer.write(output_file)
    
    print(f"✅ Internal hyperlinks added successfully!")
    print(f"📊 Summary: {links_added} index links, {banners_added} back banners")
    print(f"💾 Output saved: {out_pdf_path}")
    
    return True

def main():
    """Command line interface"""
    if len(sys.argv) < 3:
        print("Usage: python addInternalHyperlinks.py <input_pdf> <output_pdf> [index_page] [tab_count] [custom_mapping_file]")
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    index_page = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    tab_count = int(sys.argv[4]) if len(sys.argv) > 4 else 13
    custom_mapping_file = sys.argv[5] if len(sys.argv) > 5 else None
    
    try:
        add_internal_hyperlinks(input_pdf, output_pdf, index_page, tab_count, custom_mapping_file=custom_mapping_file)
        print("🎉 PDF hyperlink processing completed successfully!")
    except Exception as e:
        print(f"❌ Error processing PDF: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()