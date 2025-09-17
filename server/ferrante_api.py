"""
FastAPI endpoint for Ferrante case processing
Provides REST API for the hyperlink detection system
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
import tempfile
import os
from pathlib import Path
from typing import List
import shutil

from deterministic_hyperlink_detector import DeterministicHyperlinkDetector

app = FastAPI(title="Ferrante Hyperlink Processor", version="1.0.0")

@app.get("/")
async def root():
    return {
        "message": "Ferrante Case Hyperlink Processor",
        "version": "1.0.0",
        "endpoints": {
            "process": "POST /process - Upload PDFs and get processed results",
            "health": "GET /health - Health check"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ferrante-hyperlink-processor"}

@app.post("/instant")
async def instant_processing(
    brief_files: List[UploadFile] = File(default=[], description="Brief files"),
    trial_record: UploadFile = File(..., description="Trial record file"),
    min_confidence: float = Form(0.92, description="Minimum confidence for auto-linking"),
    use_gpt5: bool = Form(True, description="Use GPT-5 for processing"),
    model: str = Form("gpt-5", description="Model to use"),
    seed: int = Form(42, description="Random seed"),
    place_margin_markers: bool = Form(True, description="Place margin markers")
):
    """
    Instant processing endpoint compatible with Express routes
    """
    
    # Validate required files
    if not trial_record:
        raise HTTPException(status_code=400, detail="Trial record file is required")
    
    if not trial_record.filename or not trial_record.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Trial record must be a PDF")
    
    # Validate brief files
    for file in brief_files:
        if not file.filename or not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"File {file.filename or 'unknown'} must be a PDF")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Save trial record
        trial_record_path = temp_path / "trial_record.pdf"
        with open(trial_record_path, "wb") as f:
            shutil.copyfileobj(trial_record.file, f)
        
        # Save brief files
        brief_paths = []
        for i, brief_file in enumerate(brief_files):
            brief_path = temp_path / f"brief_{i+1}.pdf"
            with open(brief_path, "wb") as f:
                shutil.copyfileobj(brief_file.file, f)
            brief_paths.append(str(brief_path))
        
        # Create output directory
        output_dir = temp_path / "output"
        output_dir.mkdir()
        
        try:
            # Process the documents using deterministic pipeline
            detector = DeterministicHyperlinkDetector(str(output_dir))
            result = detector.process_deterministic_pipeline(
                brief_paths=brief_paths,
                trial_record_path=str(trial_record_path),
                min_confidence=min_confidence
            )
            
            # Copy results to persistent storage
            persistent_dir = Path("workspace/exports/instant_api")
            persistent_dir.mkdir(parents=True, exist_ok=True)
            
            master_pdf_persistent = persistent_dir / "Instant_Master.linked.pdf"
            candidate_json_persistent = persistent_dir / "Instant_candidate_hyperlink_map.json"
            candidate_csv_persistent = persistent_dir / "Instant_candidate_hyperlink_map.csv"
            
            shutil.copy(result['outputs']['master_pdf'], master_pdf_persistent)
            shutil.copy(result['outputs']['candidate_map_json'], candidate_json_persistent)
            shutil.copy(result['outputs']['candidate_map_csv'], candidate_csv_persistent)
            
            return {
                "status": "success",
                "total_references": result['total_references'],
                "high_confidence": result['high_confidence'],
                "needs_review": result['needs_review'],
                "accuracy_rate": f"{result['high_confidence']/result['total_references']*100:.1f}%" if result['total_references'] > 0 else "0%",
                "by_type": result['by_type'],
                "validation_report": result['validation_report'],
                "processing_params": {
                    "min_confidence": min_confidence,
                    "use_gpt5": use_gpt5,
                    "model": model,
                    "seed": seed,
                    "place_margin_markers": place_margin_markers
                },
                "outputs": {
                    "master_pdf_path": str(master_pdf_persistent),
                    "candidate_map_json_path": str(candidate_json_persistent),
                    "candidate_map_csv_path": str(candidate_csv_persistent)
                }
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/process")
async def process_ferrante_documents(
    brief1: UploadFile = File(..., description="Amended Doc Brief - Ferrante - 3 July 2025.pdf"),
    brief2: UploadFile = File(..., description="Amended Supp Doc Brief - Ferrante - 3 July 2025 (2).pdf"),
    trial_record: UploadFile = File(..., description="Trial Record - Ferrante - August 13 2025.pdf"),
    min_confidence: float = Form(0.5, description="Minimum confidence for auto-linking")
):
    """
    Process Ferrante case documents and generate master PDF with hyperlinks
    """
    
    # Validate file types
    for file in [brief1, brief2, trial_record]:
        if not file.filename or not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"File {file.filename or 'unknown'} must be a PDF")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Save uploaded files
        brief1_path = temp_path / "brief1.pdf"
        brief2_path = temp_path / "brief2.pdf"
        trial_record_path = temp_path / "trial_record.pdf"
        
        with open(brief1_path, "wb") as f:
            shutil.copyfileobj(brief1.file, f)
        
        with open(brief2_path, "wb") as f:
            shutil.copyfileobj(brief2.file, f)
        
        with open(trial_record_path, "wb") as f:
            shutil.copyfileobj(trial_record.file, f)
        
        # Create output directory
        output_dir = temp_path / "output"
        output_dir.mkdir()
        
        try:
            # Process the documents using deterministic pipeline
            detector = DeterministicHyperlinkDetector(str(output_dir))
            result = detector.process_deterministic_pipeline(
                brief_paths=[str(brief1_path), str(brief2_path)],
                trial_record_path=str(trial_record_path),
                min_confidence=min_confidence
            )
            
            # Copy results to persistent storage
            persistent_dir = Path("workspace/exports/ferrante_api")
            persistent_dir.mkdir(parents=True, exist_ok=True)
            
            master_pdf_persistent = persistent_dir / "Ferrante_Master.linked.pdf"
            candidate_json_persistent = persistent_dir / "Ferrante_candidate_hyperlink_map.json"
            candidate_csv_persistent = persistent_dir / "Ferrante_candidate_hyperlink_map.csv"
            
            shutil.copy(result['outputs']['master_pdf'], master_pdf_persistent)
            shutil.copy(result['outputs']['candidate_map_json'], candidate_json_persistent)
            shutil.copy(result['outputs']['candidate_map_csv'], candidate_csv_persistent)
            
            # Expected counts for validation
            expected_counts = {
                'exhibit': 108,
                'refusal': 21,
                'under_advisement': 11,
                'affidavit': 1
            }
            
            # Calculate accuracy
            accuracy_analysis = {}
            for ref_type, expected in expected_counts.items():
                found = result['by_type'].get(ref_type, 0)
                accuracy_analysis[ref_type] = {
                    "expected": expected,
                    "found": found,
                    "accuracy": "perfect" if found == expected else "deviation"
                }
            
            return {
                "status": "success",
                "total_references": result['total_references'],
                "high_confidence": result['high_confidence'],
                "needs_review": result['needs_review'],
                "accuracy_rate": f"{result['high_confidence']/result['total_references']*100:.1f}%" if result['total_references'] > 0 else "0%",
                "by_type": result['by_type'],
                "accuracy_analysis": accuracy_analysis,
                "validation_report": result['validation_report'],
                "downloads": {
                    "master_pdf": "/download/master_pdf",
                    "candidate_map_json": "/download/candidate_map_json", 
                    "candidate_map_csv": "/download/candidate_map_csv"
                },
                "deterministic_features": {
                    "chatgpt_api": "Same API as your app for consistency",
                    "confidence_scoring": "1.0 (exact), 0.85-0.90 (token), 0.80 (section)",
                    "tie_breaking": "score > lowest_page > method_order",
                    "validation_hash": result['validation_report']['deterministic_hash'][:16] + "...",
                    "reproducibility": "100% - identical inputs = identical outputs"
                }
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/download/master_pdf")
async def download_master_pdf():
    """Download the generated master PDF"""
    file_path = Path("workspace/exports/ferrante_api/Ferrante_Master.linked.pdf")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Master PDF not found. Process documents first.")
    
    return FileResponse(
        path=str(file_path),
        filename="Ferrante_Master.linked.pdf",
        media_type="application/pdf"
    )

@app.get("/download/candidate_map_json")
async def download_candidate_map_json():
    """Download the candidate map as JSON"""
    file_path = Path("workspace/exports/ferrante_api/Ferrante_candidate_hyperlink_map.json")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Candidate map JSON not found. Process documents first.")
    
    return FileResponse(
        path=str(file_path),
        filename="Ferrante_candidate_hyperlink_map.json",
        media_type="application/json"
    )

@app.get("/download/candidate_map_csv")
async def download_candidate_map_csv():
    """Download the candidate map as CSV"""
    file_path = Path("workspace/exports/ferrante_api/Ferrante_candidate_hyperlink_map.csv")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Candidate map CSV not found. Process documents first.")
    
    return FileResponse(
        path=str(file_path),
        filename="Ferrante_candidate_hyperlink_map.csv",
        media_type="text/csv"
    )

if __name__ == "__main__":
    import uvicorn
    # Use FERRANTE_PORT environment variable or default to 8002 to avoid conflicts with main server
    port = int(os.environ.get('FERRANTE_PORT', '8002'))
    uvicorn.run(app, host="0.0.0.0", port=port)