"""
Deterministic Hyperlinking Blueprint (LLM-consistent)
Ensures bit-for-bit reproducible results using the same ChatGPT API
"""
import fitz  # PyMuPDF
import json
import csv
import re
import hashlib
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, asdict
import requests
import os

@dataclass
class Rectangle:
    x0: float
    y0: float
    x1: float
    y1: float

@dataclass
class DestinationCandidate:
    dest_page: int
    confidence: float
    method: str

@dataclass
class HyperlinkReference:
    source_file: str
    source_page: int
    ref_type: str
    ref_value: str
    snippet: str
    rects: List[Rectangle]
    candidates: List[DestinationCandidate]
    top_dest_page: int
    top_confidence: float
    top_method: str
    llm_decision: Optional[str] = None

class DeterministicHyperlinkDetector:
    """Deterministic hyperlink detection with exact ChatGPT API reproducibility"""
    
    # Exact regex patterns from specification
    PATTERNS = {
        'exhibit': re.compile(r'\bExhibit\s+(?!No\b)([A-Z]{1,3}(?:-\d+)?|\d+)\b', re.IGNORECASE),
        'tab': re.compile(r'\bTab\s+(\d{1,3})\b', re.IGNORECASE),
        'schedule': re.compile(r'\bSchedule\s+([A-Z0-9]{1,3})\b', re.IGNORECASE),
        'affidavit': re.compile(r'\bAffidavit\s+of\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)(?:,?\s+dated\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})?', re.IGNORECASE),
        'undertaking': re.compile(r'\bundertaking(s)?\b', re.IGNORECASE),
        'refusal': re.compile(r'\brefusal(s)?\b', re.IGNORECASE),
        'under_advisement': re.compile(r'\bunder advisement\b', re.IGNORECASE),
        'tr_cite': re.compile(r'\b(?:TR|Trial\s+Record)\s*(?:p\.|pp\.|page|pages)?\s*(\d{1,4})\b', re.IGNORECASE)
    }
    
    # Method priority order for tie-breaking
    METHOD_ORDER = [
        'exact_exhibit', 'exact_tab', 'exact_schedule', 'exact_affidavit',
        'token_affidavit', 'token_exhibit', 'section_match'
    ]
    
    # System prompt for ChatGPT API (exact specification)
    SYSTEM_PROMPT = """Role: Hyperlink Orchestrator (Deterministic).
Mission: Apply the provided non-LLM mapping rules exactly. Do not generate content. Do not invent pages. Your decisions must be reproducible.
Rules:
1. Only consider the candidates provided.
2. If any candidate ≥ min_confidence, select using this priority: highest confidence → lowest page number → method_order.
3. If all candidates < min_confidence, respond needs_review.
4. Output only strict JSON: {"decision":"pick","dest_page":N,"reason":"..."} or {"decision":"needs_review"}.
Prohibited: speculation, external links, references to any pages not in candidates.
Temperature: 0. Top_p: 1."""

    def __init__(self, output_dir: str = "workspace/exports/ferrante"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.trial_record_index = {}
        
    def step_1_extract_deterministic(self, pdf_path: str, filename: str) -> List[HyperlinkReference]:
        """1) Extract text & rectangles deterministically (non-LLM)"""
        print(f"🔍 Extracting references from {filename}...")
        
        references = []
        doc = fitz.open(pdf_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            
            # Apply regex patterns deterministically
            for ref_type, pattern in self.PATTERNS.items():
                for match in pattern.finditer(page_text):
                    ref_value = match.group(1) if match.lastindex else match.group(0)
                    
                    # Find rectangles with deterministic fallbacks
                    needle = self._create_needle(ref_type, ref_value, match.group(0))
                    rects = self._find_rectangles_deterministic(page, needle)
                    
                    # Get context snippet
                    snippet = self._get_context_snippet(page_text, match.start(), 60)
                    
                    reference = HyperlinkReference(
                        source_file=filename,
                        source_page=page_num + 1,
                        ref_type=ref_type,
                        ref_value=ref_value,
                        snippet=snippet,
                        rects=rects,
                        candidates=[],
                        top_dest_page=0,
                        top_confidence=0.0,
                        top_method=""
                    )
                    
                    references.append(reference)
        
        doc.close()
        print(f"   ✅ Found {len(references)} references")
        return references
    
    def _create_needle(self, ref_type: str, ref_value: str, full_match: str) -> str:
        """Create search needle for rectangle detection"""
        if ref_type == 'exhibit':
            return f"Exhibit {ref_value}"
        elif ref_type == 'tab':
            return f"Tab {ref_value}"
        elif ref_type == 'schedule':
            return f"Schedule {ref_value}"
        elif ref_type == 'affidavit':
            return full_match
        else:
            return full_match
    
    def _find_rectangles_deterministic(self, page: fitz.Page, needle: str) -> List[Rectangle]:
        """Find rectangles with case/ligature/dehyphenation fallbacks"""
        rectangles = []
        
        # Try variations in deterministic order
        variations = [needle, needle.lower(), needle.upper(), needle.title()]
        flag_combinations = [
            fitz.TEXT_PRESERVE_LIGATURES,
            fitz.TEXT_PRESERVE_WHITESPACE,
            fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE,
            0  # Default
        ]
        
        for variation in variations:
            for flags in flag_combinations:
                rects = page.search_for(variation, flags=flags)
                if rects:
                    rectangles.extend([Rectangle(r.x0, r.y0, r.x1, r.y1) for r in rects])
                    break
            if rectangles:
                break
        
        # Remove duplicates deterministically
        unique_rects = []
        for rect in rectangles:
            is_duplicate = any(
                abs(rect.x0 - ur.x0) < 1 and abs(rect.y0 - ur.y0) < 1 
                for ur in unique_rects
            )
            if not is_duplicate:
                unique_rects.append(rect)
        
        return unique_rects
    
    def _get_context_snippet(self, text: str, match_index: int, context_length: int) -> str:
        """Extract context around the match"""
        start = max(0, match_index - context_length)
        end = min(len(text), match_index + context_length)
        return text[start:end].strip()
    
    def step_2_build_tr_index(self, trial_record_path: str) -> Dict[int, str]:
        """2) Build TR index deterministically (non-LLM)"""
        print("🗂️  Building Trial Record index...")
        
        doc = fitz.open(trial_record_path)
        index = {}
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text().lower()
            
            # Normalize whitespace and store
            normalized_text = ' '.join(page_text.split())
            index[page_num + 1] = normalized_text
        
        doc.close()
        self.trial_record_index = index
        print(f"   ✅ Indexed {len(index)} pages")
        return index
    
    def step_3_score_deterministic(self, references: List[HyperlinkReference]) -> List[HyperlinkReference]:
        """3) Score & tie-break deterministically (non-LLM)"""
        print("🎯 Scoring candidates deterministically...")
        
        for reference in references:
            candidates = self._score_candidates_deterministic(reference)
            reference.candidates = candidates
            
            if candidates:
                top = candidates[0]
                reference.top_dest_page = top.dest_page
                reference.top_confidence = top.confidence
                reference.top_method = top.method
        
        print(f"   ✅ Scored {len(references)} references")
        return references
    
    def _score_candidates_deterministic(self, reference: HyperlinkReference) -> List[DestinationCandidate]:
        """Score all candidates using exact specification rules"""
        candidates = []
        ref_type = reference.ref_type
        ref_value = reference.ref_value.lower()
        
        for page_num, page_text in self.trial_record_index.items():
            confidence, method = self._calculate_confidence_deterministic(ref_type, ref_value, page_text)
            
            if confidence > 0:
                candidate = DestinationCandidate(page_num, confidence, method)
                candidates.append(candidate)
        
        # Apply deterministic tie-breakers exactly as specified
        candidates.sort(key=lambda x: (
            -x.confidence,  # Higher score wins
            x.dest_page,    # Lower page wins ties
            self.METHOD_ORDER.index(x.method) if x.method in self.METHOD_ORDER else 999
        ))
        
        return candidates[:3]  # Top 3
    
    def _calculate_confidence_deterministic(self, ref_type: str, ref_value: str, page_text: str) -> Tuple[float, str]:
        """Calculate confidence using exact specification rules"""
        
        if ref_type == 'exhibit':
            # Exact phrase matching
            exact_patterns = [f"exhibit {ref_value}:", f"exhibit {ref_value} ", f"exhibit {ref_value}\n"]
            for pattern in exact_patterns:
                if pattern in page_text:
                    return 1.0, "exact_exhibit"
            
            # Token fallback
            if "exhibit" in page_text and ref_value in page_text:
                return 0.85, "token_exhibit"
                
        elif ref_type == 'tab':
            if f"tab {ref_value}" in page_text:
                return 1.0, "exact_tab"
                
        elif ref_type == 'schedule':
            if f"schedule {ref_value}" in page_text:
                return 1.0, "exact_schedule"
                
        elif ref_type == 'affidavit':
            name_lower = ref_value.lower()
            if f"affidavit of {name_lower}" in page_text:
                return 1.0, "exact_affidavit"
            
            # Token matching with name parts
            name_parts = name_lower.split()
            if "affidavit" in page_text and any(part in page_text for part in name_parts if len(part) > 2):
                return 0.90, "token_affidavit"
                
        elif ref_type in ['undertaking', 'refusal', 'under_advisement']:
            section_term = ref_type.replace('_', ' ')
            if section_term in page_text:
                return 0.80, "section_match"
                
        elif ref_type == 'tr_cite':
            try:
                page_num = int(ref_value)
                return 1.0, "direct_cite"
            except:
                pass
        
        return 0.0, "no_match"
    
    def step_4_llm_resolve(self, references: List[HyperlinkReference], min_confidence: float = 0.92) -> List[HyperlinkReference]:
        """4) Use ChatGPT API for ambiguity resolution (deterministic)"""
        print("🤖 Resolving ambiguities with ChatGPT API...")
        
        ambiguous_refs = [r for r in references if r.top_confidence < min_confidence and r.candidates]
        
        for reference in ambiguous_refs:
            decision = self._call_chatgpt_api(reference, min_confidence)
            reference.llm_decision = decision.get('decision', 'needs_review')
            
            if decision.get('decision') == 'pick':
                dest_page = decision.get('dest_page')
                # Update top candidate based on LLM decision
                for candidate in reference.candidates:
                    if candidate.dest_page == dest_page:
                        reference.top_dest_page = dest_page
                        reference.top_confidence = candidate.confidence
                        reference.top_method = candidate.method
                        break
        
        print(f"   ✅ Resolved {len(ambiguous_refs)} ambiguous references")
        return references
    
    def _call_chatgpt_api(self, reference: HyperlinkReference, min_confidence: float) -> Dict:
        """Call GPT-5 API with exact deterministic specification"""
        
        # Prepare input JSON exactly as specified
        input_data = {
            "ref": {
                "source_file": reference.source_file,
                "source_page": reference.source_page,
                "ref_type": reference.ref_type,
                "ref_value": reference.ref_value,
                "snippet": reference.snippet,
                "rects": [[r.x0, r.y0, r.x1, r.y1] for r in reference.rects]
            },
            "candidates": [
                {
                    "dest_page": c.dest_page,
                    "confidence": c.confidence,
                    "method": c.method
                } for c in reference.candidates
            ],
            "rules": {
                "min_confidence": min_confidence,
                "tie_break_order": ["score", "lowest_page", "method_order"],
                "method_order": self.METHOD_ORDER
            }
        }
        
        # Check if OpenAI API key is available
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            print("   ⚠️  OpenAI API key not found, using deterministic fallback")
            return {"decision": "needs_review"}
        
        # Use GPT-5 with Responses API for deterministic results
        model_id = os.getenv('OPENAI_MODEL', 'gpt-5')
        
        try:
            # Use GPT-5 Responses API with deterministic settings
            response = requests.post(
                'https://api.openai.com/v1/responses',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': model_id,
                    'temperature': 0,
                    'top_p': 1,
                    'seed': 42,  # Deterministic seed
                    'response_format': {'type': 'json_object'},
                    'input': [
                        {'role': 'system', 'content': self.SYSTEM_PROMPT},
                        {'role': 'user', 'content': json.dumps(input_data, indent=2)}
                    ]
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['output_text']
                return json.loads(content)
            else:
                print(f"   ⚠️  GPT-5 API call failed: {response.status_code}")
                # Fallback to Chat Completions API
                return self._fallback_chat_api(input_data, api_key)
                
        except Exception as e:
            print(f"   ⚠️  GPT-5 API error: {e}")
            # Fallback to Chat Completions API
            return self._fallback_chat_api(input_data, api_key)
    
    def _fallback_chat_api(self, input_data: Dict, api_key: str) -> Dict:
        """Fallback to Chat Completions API if Responses API fails"""
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'gpt-4',  # Use GPT-4 as fallback
                    'temperature': 0,
                    'top_p': 1,
                    'seed': 42,
                    'response_format': {'type': 'json_object'},
                    'messages': [
                        {'role': 'system', 'content': self.SYSTEM_PROMPT},
                        {'role': 'user', 'content': json.dumps(input_data, indent=2)}
                    ]
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                return json.loads(content)
            else:
                print(f"   ⚠️  Fallback API call failed: {response.status_code}")
                return {"decision": "needs_review"}
                
        except Exception as e:
            print(f"   ⚠️  Fallback API error: {e}")
            return {"decision": "needs_review"}
    
    def step_5_build_master_pdf(self, brief_paths: List[str], trial_record_path: str, 
                               references: List[HyperlinkReference], min_confidence: float = 0.92) -> str:
        """5) Build Master PDF with links (non-LLM)"""
        print("📖 Building Master PDF with internal hyperlinks...")
        
        master_path = self.output_dir / "Ferrante_Master.linked.pdf"
        
        # Create master document
        master_doc = fitz.open()
        
        # Add Brief documents
        brief_page_count = 0
        for brief_path in brief_paths:
            brief_doc = fitz.open(brief_path)
            master_doc.insert_pdf(brief_doc)
            brief_page_count += len(brief_doc)
            brief_doc.close()
        
        # Add Trial Record
        tr_doc = fitz.open(trial_record_path)
        tr_offset = brief_page_count
        master_doc.insert_pdf(tr_doc)
        tr_doc.close()
        
        # Insert hyperlinks
        links_added = 0
        for ref in references:
            should_link = (ref.top_confidence >= min_confidence or 
                          ref.llm_decision == 'pick') and ref.rects
            
            if should_link:
                source_page_global = self._get_global_page_number(ref.source_file, ref.source_page, brief_paths)
                target_page_global = tr_offset + ref.top_dest_page - 1
                
                if 0 <= source_page_global < len(master_doc):
                    page = master_doc[source_page_global]
                    
                    for rect in ref.rects:
                        link_rect = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1)
                        page.insert_link({
                            "from": link_rect,
                            "kind": fitz.LINK_GOTO,
                            "page": target_page_global,
                            "to": fitz.Point(0, 0)
                        })
                        links_added += 1
        
        # Save master PDF
        master_doc.save(str(master_path))
        master_doc.close()
        
        print(f"   ✅ Master PDF created with {links_added} links")
        return str(master_path)
    
    def _get_global_page_number(self, source_file: str, source_page: int, brief_paths: List[str]) -> int:
        """Calculate global page number in master PDF"""
        page_offset = 0
        
        for brief_path in brief_paths:
            brief_filename = Path(brief_path).name
            if source_file == brief_filename:
                return page_offset + source_page - 1
            
            doc = fitz.open(brief_path)
            page_offset += len(doc)
            doc.close()
        
        return -1
    
    def step_6_validate_deterministic(self, master_pdf_path: str, references: List[HyperlinkReference]) -> Dict:
        """6) Validation with deterministic hash (non-LLM)"""
        print("✅ Validating with deterministic hash...")
        
        # Count categories
        auto_linked = sum(1 for r in references if r.top_confidence >= 0.92)
        reviewed_linked = sum(1 for r in references if r.llm_decision == 'pick')
        exceptions = len(references) - auto_linked - reviewed_linked
        
        # Check broken links
        doc = fitz.open(master_pdf_path)
        broken_links = 0
        for page_num in range(len(doc)):
            page = doc[page_num]
            links = page.get_links()
            for link in links:
                if link.get("page", -1) >= len(doc):
                    broken_links += 1
        doc.close()
        
        # Calculate deterministic hash
        hash_data = []
        for ref in references:
            if ref.top_dest_page > 0:
                hash_data.append({
                    'source_file': ref.source_file,
                    'source_page': ref.source_page,
                    'ref_type': ref.ref_type,
                    'ref_value': ref.ref_value,
                    'top_dest_page': ref.top_dest_page
                })
        
        # Sort for deterministic hash
        hash_data.sort(key=lambda x: (x['source_file'], x['source_page'], x['ref_type'], x['ref_value']))
        deterministic_hash = hashlib.sha256(json.dumps(hash_data, sort_keys=True).encode()).hexdigest()
        
        report = {
            "total_detected": len(references),
            "auto_linked": auto_linked,
            "reviewed_linked": reviewed_linked,
            "exceptions": exceptions,
            "broken_links": broken_links,
            "coverage_percent": ((auto_linked + reviewed_linked) / len(references) * 100) if references else 0,
            "deterministic_hash": deterministic_hash
        }
        
        # Save validation report
        report_path = self.output_dir / "validation_report.json"
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"   📊 Validation complete - Hash: {deterministic_hash[:16]}...")
        return report
    
    def export_candidate_map(self, references: List[HyperlinkReference]) -> Tuple[str, str]:
        """Export candidate map for review"""
        print("📋 Exporting candidate map...")
        
        # JSON export
        json_data = {
            "case": "Ferrante",
            "total_references": len(references),
            "by_type": self._count_by_type(references),
            "high_confidence": len([r for r in references if r.top_confidence >= 0.92]),
            "needs_review": len([r for r in references if r.top_confidence < 0.92]),
            "references": [asdict(ref) for ref in references]
        }
        
        json_path = self.output_dir / "Ferrante_candidate_hyperlink_map.json"
        with open(json_path, 'w') as f:
            json.dump(json_data, f, indent=2, default=str)
        
        # CSV export
        csv_path = self.output_dir / "Ferrante_candidate_hyperlink_map.csv"
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'source_file', 'source_page', 'ref_type', 'ref_value', 'snippet',
                'rects_count', 'top_dest_page', 'top_confidence', 'top_method',
                'llm_decision', 'deterministic_hash'
            ])
            
            for ref in references:
                writer.writerow([
                    ref.source_file, ref.source_page, ref.ref_type, ref.ref_value,
                    f'"{ref.snippet}"', len(ref.rects),
                    ref.top_dest_page, ref.top_confidence, ref.top_method,
                    ref.llm_decision or 'auto'
                ])
        
        print(f"   ✅ Exported: {json_path.name}, {csv_path.name}")
        return str(json_path), str(csv_path)
    
    def _count_by_type(self, references: List[HyperlinkReference]) -> Dict[str, int]:
        """Count references by type"""
        counts = {}
        for ref in references:
            counts[ref.ref_type] = counts.get(ref.ref_type, 0) + 1
        return counts
    
    def process_deterministic_pipeline(self, brief_paths: List[str], trial_record_path: str,
                                     min_confidence: float = 0.92) -> Dict[str, Any]:
        """Execute complete deterministic pipeline"""
        print("🚀 Starting Deterministic Hyperlinking Pipeline...")
        
        # Step 1: Extract deterministically
        all_references = []
        for brief_path in brief_paths:
            filename = Path(brief_path).name
            refs = self.step_1_extract_deterministic(brief_path, filename)
            all_references.extend(refs)
        
        # Step 2: Build TR index
        self.step_2_build_tr_index(trial_record_path)
        
        # Step 3: Score deterministically
        all_references = self.step_3_score_deterministic(all_references)
        
        # Step 4: LLM resolve ambiguities
        all_references = self.step_4_llm_resolve(all_references, min_confidence)
        
        # Step 5: Export candidate map
        json_path, csv_path = self.export_candidate_map(all_references)
        
        # Step 6: Build master PDF
        master_pdf_path = self.step_5_build_master_pdf(brief_paths, trial_record_path, all_references, min_confidence)
        
        # Step 7: Validate with hash
        validation_report = self.step_6_validate_deterministic(master_pdf_path, all_references)
        
        results = {
            "status": "success",
            "total_references": len(all_references),
            "by_type": self._count_by_type(all_references),
            "high_confidence": len([r for r in all_references if r.top_confidence >= 0.92]),
            "needs_review": len([r for r in all_references if r.top_confidence < 0.92]),
            "validation_report": validation_report,
            "outputs": {
                "master_pdf": master_pdf_path,
                "candidate_map_json": json_path,
                "candidate_map_csv": csv_path
            }
        }
        
        print("\n🎉 Deterministic Pipeline Complete!")
        print(f"   📊 Total References: {results['total_references']}")
        print(f"   ✅ High Confidence: {results['high_confidence']}")
        print(f"   🔄 Hash: {validation_report['deterministic_hash'][:16]}...")
        
        return results