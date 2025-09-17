#!/usr/bin/env python3
"""
CLI Script for Building Court-Ready Master PDF with Internal Hyperlinks
Command-line interface for the instant processing pipeline
"""

import argparse
import sys
import os
import json
from pathlib import Path

# Add the server directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))

from deterministic_hyperlink_detector import DeterministicHyperlinkDetector

def main():
    parser = argparse.ArgumentParser(
        description="Build court-ready Master PDF with internal hyperlinks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --briefs brief1.pdf brief2.pdf --trial trial_record.pdf
  %(prog)s --briefs "*.pdf" --trial trial.pdf --min-confidence 0.95 --use-gpt5 true
        """
    )
    
    parser.add_argument(
        '--briefs', 
        nargs='+', 
        required=True,
        help='Brief PDF files to process'
    )
    
    parser.add_argument(
        '--trial', 
        required=True,
        help='Trial Record PDF file'
    )
    
    parser.add_argument(
        '--min-confidence', 
        type=float, 
        default=0.92,
        help='Minimum confidence threshold (default: 0.92)'
    )
    
    parser.add_argument(
        '--use-gpt5', 
        type=str, 
        choices=['true', 'false'], 
        default='true',
        help='Use GPT-5 for resolution (default: true)'
    )
    
    parser.add_argument(
        '--model', 
        default='gpt-5',
        help='OpenAI model to use (default: gpt-5)'
    )
    
    parser.add_argument(
        '--seed', 
        type=int, 
        default=42,
        help='Deterministic seed (default: 42)'
    )
    
    parser.add_argument(
        '--place-margin-markers', 
        type=str, 
        choices=['true', 'false'], 
        default='true',
        help='Add margin markers for unfound rectangles (default: true)'
    )
    
    parser.add_argument(
        '--output-dir', 
        default='workspace/exports/ferrante_cli',
        help='Output directory (default: workspace/exports/ferrante_cli)'
    )
    
    args = parser.parse_args()
    
    # Validate input files
    brief_paths = []
    for brief_pattern in args.briefs:
        if '*' in brief_pattern:
            import glob
            files = glob.glob(brief_pattern)
            brief_paths.extend(files)
        else:
            brief_paths.append(brief_pattern)
    
    # Check all files exist
    for brief_path in brief_paths:
        if not Path(brief_path).exists():
            print(f"❌ Error: Brief file not found: {brief_path}")
            sys.exit(1)
    
    if not Path(args.trial).exists():
        print(f"❌ Error: Trial record file not found: {args.trial}")
        sys.exit(1)
    
    # Set environment variables
    if args.use_gpt5.lower() == 'true':
        os.environ['OPENAI_MODEL'] = args.model
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("🚀 Starting Court-Ready Master PDF Pipeline...")
    print(f"   📄 Brief files: {len(brief_paths)}")
    print(f"   📖 Trial record: {Path(args.trial).name}")
    print(f"   🎯 Min confidence: {args.min_confidence}")
    print(f"   🤖 GPT-5 enabled: {args.use_gpt5}")
    print(f"   📁 Output: {output_dir}")
    
    try:
        # Process with deterministic pipeline
        detector = DeterministicHyperlinkDetector(str(output_dir))
        
        result = detector.process_deterministic_pipeline(
            brief_paths=brief_paths,
            trial_record_path=args.trial,
            min_confidence=args.min_confidence
        )
        
        print("\n📊 PROCESSING RESULTS:")
        print(f"   Total references: {result['total_references']}")
        print(f"   High confidence (≥{args.min_confidence*100}%): {result['high_confidence']}")
        print(f"   Needs review: {result['needs_review']}")
        
        # Display by type
        print("\n📋 BY REFERENCE TYPE:")
        for ref_type, count in result['by_type'].items():
            print(f"   {ref_type}: {count}")
        
        # Validate the Master PDF
        master_pdf_path = result['outputs']['master_pdf']
        print(f"\n✅ VALIDATION:")
        
        from instant_processor import validate_master_pdf
        validation = validate_master_pdf(master_pdf_path)
        
        print(f"   Status: {validation['summary']['status']}")
        print(f"   Message: {validation['summary']['message']}")
        print(f"   Total pages: {validation.get('total_pages', 'N/A')}")
        print(f"   Total links: {validation.get('total_links', 'N/A')}")
        print(f"   Broken links: {validation.get('broken_links', 'N/A')}")
        print(f"   Court ready: {'YES' if validation.get('court_ready') else 'NO'}")
        
        # Save validation report
        validation_path = output_dir / "validation_report.json"
        with open(validation_path, 'w') as f:
            json.dump(validation, f, indent=2)
        
        print(f"\n📁 OUTPUT FILES:")
        print(f"   Master PDF: {master_pdf_path}")
        print(f"   Candidate map (JSON): {result['outputs']['candidate_map_json']}")
        print(f"   Candidate map (CSV): {result['outputs']['candidate_map_csv']}")
        print(f"   Validation report: {validation_path}")
        
        # Final status
        if validation.get('court_ready'):
            print(f"\n🎉 SUCCESS: Master PDF is court-ready!")
            print(f"   Hash: {result['validation_report']['deterministic_hash'][:16]}...")
        else:
            print(f"\n⚠️  WARNING: {validation.get('broken_links', 0)} broken links found")
            print(f"   Review the validation report before court submission")
        
        return 0 if validation.get('court_ready') else 1
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)