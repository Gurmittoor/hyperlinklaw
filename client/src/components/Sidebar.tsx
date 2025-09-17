import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Case } from "@shared/schema";

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const [showCaseManager, setShowCaseManager] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cases = [] } = useQuery({
    queryKey: ['/api/cases'],
    queryFn: () => api.cases.getAll(),
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Case> }) => api.cases.update(id, data),
    onSuccess: () => {
      toast({ title: "Case updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      setEditingCase(null);
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
    mutationFn: (data: { caseNumber: string; title: string; status: string }) => api.cases.create(data),
    onSuccess: (newCase) => {
      toast({ title: "Case created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      setLocation(`/cases/${newCase.id}`);
      setNewCaseTitle("");
    },
    onError: () => {
      toast({ title: "Failed to create case", variant: "destructive" });
    },
  });

  const handleEditCase = (caseItem: Case) => {
    setEditingCase(caseItem);
  };

  const handleSaveCase = () => {
    if (editingCase) {
      updateCaseMutation.mutate({
        id: editingCase.id,
        data: { title: editingCase.title }
      });
    }
  };

  const handleDeleteCase = (caseId: string) => {
    if (confirm("Are you sure you want to delete this case? This will also delete all associated documents.")) {
      deleteCaseMutation.mutate(caseId);
    }
  };

  const handleCreateCase = () => {
    if (newCaseTitle.trim()) {
      createCaseMutation.mutate({
        caseNumber: `2024-CV-${Date.now().toString().slice(-6)}`,
        title: newCaseTitle.trim(),
        status: "active"
      });
    }
  };

  const navigationItems = [
    { path: "/case-management", icon: "fas fa-briefcase", label: "1. Create Case", step: 1 },
    { path: "/", icon: "fas fa-folder-open", label: "2. Upload Documents", step: 2 },
    { path: "/ocr", icon: "fas fa-eye", label: "3. OCR Processing", step: 3 },
    { path: "/links", icon: "fas fa-link", label: "4. AI Hyperlinking", step: 4 },
    { path: "/review", icon: "fas fa-check-circle", label: "5. Lawyer Review", step: 5 },
    { path: "/court-ready", icon: "fas fa-download", label: "6. Court Submit", step: 6 },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-gavel text-primary-foreground text-sm"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">hyperlinklaw.com</h1>
            <p className="text-xs text-muted-foreground">Legal Document System</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2" data-testid="navigation">
        {navigationItems.map((item, index) => (
          <Link key={index} href={item.path}>
            <span
              className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors cursor-pointer ${
                location === item.path
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
            >
              <i className={`${item.icon} text-sm`}></i>
              {item.label}
            </span>
          </Link>
        ))}
        
        <div className="pt-4 border-t border-border">
          <button
            onClick={() => setShowCaseManager(!showCaseManager)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors hover:bg-secondary text-muted-foreground hover:text-foreground"
            data-testid="button-manage-cases"
          >
            <i className="fas fa-cog text-sm"></i>
            Manage Cases
            <i className={`fas fa-chevron-${showCaseManager ? 'up' : 'down'} text-xs ml-auto`}></i>
          </button>
          
          {showCaseManager && (
            <div className="mt-2 space-y-2">
              <div className="px-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New case title..."
                    value={newCaseTitle}
                    onChange={(e) => setNewCaseTitle(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-input border border-border rounded"
                    data-testid="input-new-case"
                  />
                  <button
                    onClick={handleCreateCase}
                    disabled={!newCaseTitle.trim() || createCaseMutation.isPending}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    data-testid="button-create-case"
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-1">
                {cases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    className="mx-3 p-2 bg-muted/50 rounded text-xs"
                    data-testid={`case-item-${caseItem.id}`}
                  >
                    {editingCase?.id === caseItem.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editingCase.title}
                          onChange={(e) => setEditingCase({ ...editingCase, title: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-input border border-border rounded"
                          data-testid={`input-edit-case-${caseItem.id}`}
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={handleSaveCase}
                            disabled={updateCaseMutation.isPending}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            data-testid={`button-save-case-${caseItem.id}`}
                          >
                            <i className="fas fa-check"></i>
                          </button>
                          <button
                            onClick={() => setEditingCase(null)}
                            className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                            data-testid={`button-cancel-edit-${caseItem.id}`}
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-foreground truncate">{caseItem.title}</div>
                        <div className="text-muted-foreground">{caseItem.caseNumber}</div>
                        <div className="flex gap-1 mt-2">
                          <button
                            onClick={() => setLocation(`/cases/${caseItem.id}`)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            title="Open Case"
                            data-testid={`button-open-case-${caseItem.id}`}
                          >
                            <i className="fas fa-folder-open"></i>
                          </button>
                          <button
                            onClick={() => handleEditCase(caseItem)}
                            className="px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                            title="Edit Case"
                            data-testid={`button-edit-case-${caseItem.id}`}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteCase(caseItem.id)}
                            disabled={deleteCaseMutation.isPending}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            title="Delete Case"
                            data-testid={`button-delete-case-${caseItem.id}`}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <i className="fas fa-user text-muted-foreground text-sm"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Legal Associate</p>
            <p className="text-xs text-muted-foreground truncate">Active Session</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
