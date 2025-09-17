import { useState, startTransition } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Scale, FileText, Clock, CheckCircle, ArrowRight, Folder, Calendar, Search, Users, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { Case } from '@shared/schema';

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [caseForm, setCaseForm] = useState({
    caseNumber: '',
    filingDate: new Date().toISOString().split('T')[0],
    plaintiff: '',
    defendant: '',
    courtName: '',
    judgeName: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [duplicateCase, setDuplicateCase] = useState<Case | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch existing cases
  const { data: existingCases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['/api/cases'],
    queryFn: () => api.cases.getAll(),
  });

  // Filter cases based on search query
  const filteredCases = Array.isArray(existingCases) ? existingCases.filter(caseItem => 
    caseItem?.caseNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    caseItem?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    caseItem?.plaintiff?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    caseItem?.defendant?.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  const createCaseMutation = useMutation({
    mutationFn: async (formData: typeof caseForm) => {
      const storagePath = `cases/${formData.caseNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const title = `${formData.plaintiff} v. ${formData.defendant}`;
      
      return api.cases.create({
        caseNumber: formData.caseNumber,
        title,
        filingDate: formData.filingDate,
        plaintiff: formData.plaintiff,
        defendant: formData.defendant,
        courtName: formData.courtName,
        judgeName: formData.judgeName,
        storagePath,
        status: 'active'
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Case Created Successfully!",
        description: "You can now upload documents to this case.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      // Navigate to the case dashboard
      setLocation(`/cases/${data.id}`);
    },
    onError: (error: any) => {
      console.error('Error creating case:', error);
      
      // Handle specific error cases
      let errorTitle = "Failed to Create Case";
      let errorDescription = "Please check your input and try again.";
      
      if (error?.message) {
        if (error.message.includes('case number already exists') || error.message.includes('duplicate') || error.message.includes('already exists')) {
          errorTitle = "Duplicate Case Number";
          errorDescription = `Case number "${caseForm.caseNumber}" already exists.`;
          
          // Find the duplicate case and show it
          const existingCase = existingCases.find(c => c.caseNumber === caseForm.caseNumber);
          if (existingCase) {
            setDuplicateCase(existingCase);
          }
        } else {
          errorDescription = error.message;
        }
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    },
  });

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    createCaseMutation.mutate(caseForm);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800" data-testid="home-page">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="w-8 h-8 text-blue-400" />
              <h1 className="text-2xl font-bold text-white">hyperlinklaw.com</h1>
            </div>
            <p className="text-white bg-gray-800/80 px-3 py-1 rounded">Legal Document Auto-Hyperlinking System</p>
          </div>
        </div>
      </div>

      {!showCreateCase ? (
        // Landing Screen
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              Save Days of Manual Hyperlinking
            </h2>
            <p className="text-xl text-white bg-gray-800/80 px-4 py-2 rounded">
              AI-powered document processing that creates perfect cross-references in minutes
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <Clock className="w-10 h-10 text-blue-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Hours to Minutes
              </h3>
              <p className="text-gray-400">
                Process thousands of pages instantly
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <FileText className="w-10 h-10 text-green-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                100% Accurate
              </h3>
              <p className="text-gray-400">
                AI finds every reference and citation
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <CheckCircle className="w-10 h-10 text-purple-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Court Ready
              </h3>
              <p className="text-gray-400">
                Lawyer-reviewed and judge-friendly
              </p>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 mb-12">
            <h3 className="text-xl font-bold text-white mb-6 text-center">Simple 6-Step Process</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setLocation('/case-management')}
                data-testid="step-create-case"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <span className="text-sm text-center">Create Case</span>
              </div>
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => {
                  // If there are existing cases, go to the first one, otherwise create new
                  if (existingCases && existingCases.length > 0) {
                    setLocation(`/cases/${existingCases[0].id}`);
                  } else {
                    setShowCreateCase(true);
                  }
                }}
                data-testid="step-upload-pdfs"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <span className="text-sm text-center">Upload PDFs</span>
              </div>
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => {
                  // Navigate to OCR page - if there are cases, use the first one, otherwise redirect route
                  if (existingCases && existingCases.length > 0) {
                    setLocation(`/cases/${existingCases[0].id}/ocr`);
                  } else {
                    setLocation('/ocr'); // This redirects to latest case OCR via RedirectToLatestCaseOCR
                  }
                }}
                data-testid="step-ocr-processing"
              >
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <span className="text-sm text-center">OCR Processing</span>
              </div>
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setLocation('/hyperlinks')}
                data-testid="step-ai-hyperlinking"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">4</div>
                <span className="text-sm text-center">AI Hyperlinking</span>
              </div>
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => {
                  // Navigate to review page - if there are cases, use the first one
                  if (existingCases && existingCases.length > 0) {
                    setLocation(`/cases/${existingCases[0].id}/review`);
                  } else {
                    setLocation('/review'); // Falls back to generic review page
                  }
                }}
                data-testid="step-lawyer-review"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">5</div>
                <span className="text-sm text-center">Lawyer Review</span>
              </div>
              <div 
                className="flex flex-col items-center gap-2 text-white cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setLocation('/instant')}
                data-testid="step-court-submit"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">6</div>
                <span className="text-sm text-center">Court Submit</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="text-center space-y-4">
            {/* Primary: Instant Processor */}
            <div className="p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-xl mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="w-6 h-6 text-yellow-400" />
                <span className="px-3 py-1 bg-yellow-500 text-black text-sm font-bold rounded-full">NEW</span>
              </div>
              <h3 className="text-xl font-bold text-yellow-300 mb-2">Instant Court-Ready PDF</h3>
              <p className="text-yellow-200 mb-4">Upload your legal documents and get a Master PDF with hyperlinks in minutes</p>
              <button
                onClick={() => {
                  startTransition(() => {
                    setLocation('/instant');
                  });
                }}
                className="px-8 py-4 bg-yellow-500 hover:bg-yellow-600 text-black text-lg font-bold rounded-xl transition-all transform hover:scale-105 shadow-xl"
                data-testid="button-instant-processor"
              >
                <Zap className="w-5 h-5 mr-2 inline" />
                Try Instant Processor
              </button>
            </div>
            
          </div>

        </div>
      ) : (
        // Case Creation Form
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                Step 1: Create New Case
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateCase(false);
                  setDuplicateCase(null);
                }}
                className="text-gray-300 hover:text-white text-sm flex items-center gap-1"
                data-testid="button-back-to-home"
              >
                Back to Existing Cases
              </button>
            </div>

            {/* Duplicate Case Warning */}
            {duplicateCase && (
              <div className="mb-6 p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-yellow-300 font-medium mb-2">
                  Case Already Exists
                </h3>
                <p className="text-yellow-200 text-sm mb-3">
                  A case with number "{duplicateCase.caseNumber}" already exists in the system.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setLocation(`/cases/${duplicateCase.id}`)}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                    data-testid="button-open-existing-case"
                  >
                    Open Existing Case →
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateCase(null)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Use Different Case Number
                  </button>
                </div>
              </div>
            )}

            {/* Recent Cases with Search */}
            {Array.isArray(existingCases) && existingCases.length > 0 && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Recent Cases ({existingCases.length})
                </h3>
                
                {/* Search Input */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by case number, title, or parties..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    data-testid="input-search-cases"
                  />
                </div>

                {/* Recent Cases List */}
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {filteredCases.length > 0 ? (
                    filteredCases.slice(0, 8).map((caseItem) => (
                      <div
                        key={caseItem.id}
                        className="flex items-center justify-between p-3 bg-white/10 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                        onClick={() => setLocation(`/cases/${caseItem.id}`)}
                        data-testid={`recent-case-${caseItem.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white truncate">
                              {caseItem.title}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
                              {caseItem.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-300">
                            <span className="font-mono text-blue-300">{caseItem.caseNumber}</span>
                            <span className="mx-2">•</span>
                            <span>{new Date(caseItem.filingDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="text-xs text-blue-300 hover:text-blue-200 ml-2">
                          Open →
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-400 text-sm py-4">
                      {searchQuery ? `No cases found matching "${searchQuery}"` : 'No recent cases'}
                    </div>
                  )}
                  
                  {filteredCases.length > 8 && (
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setLocation('/dashboard')}
                        className="text-blue-300 hover:text-blue-200 text-xs"
                      >
                        View all {filteredCases.length} matching cases →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Case Number *
                </label>
                <input
                  type="text"
                  required
                  value={caseForm.caseNumber}
                  onChange={(e) => setCaseForm({...caseForm, caseNumber: e.target.value})}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., CV-2024-001234"
                  data-testid="input-case-number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Filing Date *
                </label>
                <input
                  type="date"
                  required
                  value={caseForm.filingDate}
                  onChange={(e) => setCaseForm({...caseForm, filingDate: e.target.value})}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-filing-date"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Plaintiff/Applicant *
                  </label>
                  <input
                    type="text"
                    required
                    value={caseForm.plaintiff}
                    onChange={(e) => setCaseForm({...caseForm, plaintiff: e.target.value})}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Party name"
                    data-testid="input-plaintiff"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Defendant/Respondent *
                  </label>
                  <input
                    type="text"
                    required
                    value={caseForm.defendant}
                    onChange={(e) => setCaseForm({...caseForm, defendant: e.target.value})}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Party name"
                    data-testid="input-defendant"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Court Name
                  </label>
                  <input
                    type="text"
                    value={caseForm.courtName}
                    onChange={(e) => setCaseForm({...caseForm, courtName: e.target.value})}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Superior Court"
                    data-testid="input-court-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Judge Name
                  </label>
                  <input
                    type="text"
                    value={caseForm.judgeName}
                    onChange={(e) => setCaseForm({...caseForm, judgeName: e.target.value})}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Hon. Judge Name"
                    data-testid="input-judge-name"
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateCase(false)}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition"
                  data-testid="button-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCaseMutation.isPending}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition"
                  data-testid="button-create-case"
                >
                  {createCaseMutation.isPending ? 'Creating...' : 'Create Case & Upload Documents'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}