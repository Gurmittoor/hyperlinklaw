import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Case } from "@shared/schema";

export default function CaseManager() {
  const [, setLocation] = useLocation();
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Case>>({});
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState({
    caseNumber: '',
    title: '',
    status: 'active' as const
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: casesData, isLoading, error } = useQuery({
    queryKey: ['/api/cases'],
    queryFn: () => api.cases.getAll(),
  });

  // Ensure cases is always an array
  const cases = Array.isArray(casesData) ? casesData : [];

  const updateCaseMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Case> }) => api.cases.update(id, data),
    onSuccess: () => {
      toast({ title: "Case updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      setEditingCase(null);
      setEditForm({});
    },
    onError: () => {
      toast({ title: "Failed to update case", variant: "destructive" });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => api.cases.delete(id),
    onSuccess: () => {
      toast({ title: "Case deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
    },
    onError: () => {
      toast({ title: "Failed to delete case", variant: "destructive" });
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (data: any) => api.cases.create(data),
    onSuccess: (newCase) => {
      toast({ title: "Case created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      setShowNewCase(false);
      setNewCaseForm({ caseNumber: '', title: '', status: 'active' });
      handleOpen(newCase.id);
    },
    onError: () => {
      toast({ title: "Failed to create case", variant: "destructive" });
    },
  });

  const handleOpen = (caseId: string) => {
    setSelectedCase(caseId);
    // Navigate to Step 2 (Upload Documents) - the case documents page
    setLocation(`/cases/${caseId}`);
  };

  const handleEdit = (caseItem: Case) => {
    setEditingCase(caseItem.id);
    setEditForm({
      caseNumber: caseItem.caseNumber,
      title: caseItem.title,
      status: caseItem.status
    });
  };

  const handleSaveEdit = () => {
    if (editingCase && editForm) {
      updateCaseMutation.mutate({
        id: editingCase,
        data: editForm
      });
    }
  };

  const handleDelete = (caseId: string, caseNumber: string) => {
    if (confirm(`Are you sure you want to delete case ${caseNumber}? This will also delete all associated documents and cannot be undone.`)) {
      deleteCaseMutation.mutate(caseId);
    }
  };

  const handleCreateCase = () => {
    if (newCaseForm.caseNumber.trim() && newCaseForm.title.trim()) {
      // Add required fields that are missing from the form
      const caseData = {
        ...newCaseForm,
        filingDate: new Date().toISOString(), // Current date as default
        plaintiff: "To be determined", // Default placeholder
        defendant: "To be determined", // Default placeholder
        storagePath: `cases/${Date.now()}-${newCaseForm.caseNumber.replace(/[^a-zA-Z0-9]/g, '-')}`, // Generate storage path
      };
      createCaseMutation.mutate(caseData);
    }
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Case Management</h2>
        <button
          onClick={() => setShowNewCase(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          data-testid="button-new-case"
        >
          <i className="fas fa-plus"></i>
          New Case
        </button>
      </div>

      {/* New Case Form */}
      {showNewCase && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Create New Case</h3>
              <button
                onClick={() => setShowNewCase(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-new-case"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Case Number*"
                value={newCaseForm.caseNumber}
                onChange={(e) => setNewCaseForm({ ...newCaseForm, caseNumber: e.target.value })}
                className="px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-new-case-number"
              />
              <input
                type="text"
                placeholder="Case Title*"
                value={newCaseForm.title}
                onChange={(e) => setNewCaseForm({ ...newCaseForm, title: e.target.value })}
                className="px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-new-case-title"
              />
              <button
                onClick={handleCreateCase}
                disabled={!newCaseForm.caseNumber || !newCaseForm.title || createCaseMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                data-testid="button-create-case"
              >
                {createCaseMutation.isPending ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  'Create Case'
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cases List */}
      <div className="space-y-4">
        {cases.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <i className="fas fa-folder-open text-4xl text-muted-foreground mb-4"></i>
              <p className="text-muted-foreground">No cases found. Create your first case to get started.</p>
            </CardContent>
          </Card>
        ) : (
          cases.map((caseItem) => (
            <Card
              key={caseItem.id}
              className={`transition-all hover:shadow-md ${
                selectedCase === caseItem.id ? 'ring-2 ring-primary' : ''
              }`}
              data-testid={`case-card-${caseItem.id}`}
            >
              <CardContent className="p-6">
                {editingCase === caseItem.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Case Number
                        </label>
                        <input
                          type="text"
                          value={editForm.caseNumber || ''}
                          onChange={(e) => setEditForm({ ...editForm, caseNumber: e.target.value })}
                          className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid={`input-edit-case-number-${caseItem.id}`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          value={editForm.title || ''}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid={`input-edit-case-title-${caseItem.id}`}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={updateCaseMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                        data-testid={`button-save-edit-${caseItem.id}`}
                      >
                        <i className="fas fa-check"></i>
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingCase(null);
                          setEditForm({});
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                        data-testid={`button-cancel-edit-${caseItem.id}`}
                      >
                        <i className="fas fa-times"></i>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-foreground">
                          {caseItem.caseNumber}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          caseItem.status === 'active' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100'
                        }`}>
                          {caseItem.status}
                        </span>
                      </div>
                      <p className="text-lg text-foreground mb-2">{caseItem.title}</p>
                      <div className="text-sm text-muted-foreground">
                        Created: {formatDate(caseItem.createdAt)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleOpen(caseItem.id)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        title="Open Case"
                        data-testid={`button-open-case-${caseItem.id}`}
                      >
                        <i className="fas fa-folder-open"></i>
                        Open
                      </button>
                      <button
                        onClick={() => handleEdit(caseItem)}
                        className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
                        title="Edit Case"
                        data-testid={`button-edit-case-${caseItem.id}`}
                      >
                        <i className="fas fa-edit"></i>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(caseItem.id, caseItem.caseNumber)}
                        disabled={deleteCaseMutation.isPending}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                        title="Delete Case"
                        data-testid={`button-delete-case-${caseItem.id}`}
                      >
                        <i className="fas fa-trash"></i>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}