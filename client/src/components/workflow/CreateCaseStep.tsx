import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertCaseSchema, type Case } from "@shared/schema";
import { z } from "zod";

const createCaseFormSchema = insertCaseSchema.extend({
  filingDate: z.string().min(1, "Filing date is required"),
});

interface CreateCaseStepProps {
  caseData?: Case;
  onCaseCreated: (caseData: Case) => void;
}

export function CreateCaseStep({ caseData, onCaseCreated }: CreateCaseStepProps) {
  const [isEditing, setIsEditing] = useState(!caseData);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof createCaseFormSchema>>({
    resolver: zodResolver(createCaseFormSchema),
    defaultValues: {
      caseNumber: caseData?.caseNumber || `2024-CV-${Date.now().toString().slice(-6)}`,
      title: caseData?.title || "",
      filingDate: caseData?.filingDate || new Date().toISOString().split('T')[0],
      plaintiff: caseData?.plaintiff || "",
      defendant: caseData?.defendant || "",
      courtName: caseData?.courtName || "",
      judgeName: caseData?.judgeName || "",
      storagePath: caseData?.storagePath || "",
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createCaseFormSchema>) => {
      const storagePathValue = data.storagePath || `cases/${data.caseNumber}`;
      return apiRequest("/api/cases", {
        method: "POST",
        body: { ...data, storagePath: storagePathValue },
      });
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      onCaseCreated(newCase);
      setIsEditing(false);
      toast({
        title: "Case Created",
        description: `Case ${newCase.caseNumber} has been created successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create case: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createCaseFormSchema>) => {
      return apiRequest(`/api/cases/${caseData?.id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: (updatedCase) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      onCaseCreated(updatedCase);
      setIsEditing(false);
      toast({
        title: "Case Updated",
        description: `Case ${updatedCase.caseNumber} has been updated successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update case: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof createCaseFormSchema>) => {
    if (caseData) {
      updateCaseMutation.mutate(data);
    } else {
      createCaseMutation.mutate(data);
    }
  };

  const mutation = caseData ? updateCaseMutation : createCaseMutation;

  if (caseData && !isEditing) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <i className="fas fa-check text-green-600 text-xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Step 1: Case Created ✅</h1>
              <p className="text-lg text-muted-foreground">Your legal case has been set up successfully</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Case Number</Label>
              <div className="text-lg font-semibold">{caseData.caseNumber}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Filing Date</Label>
              <div className="text-lg">{new Date(caseData.filingDate).toLocaleDateString()}</div>
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm font-medium text-muted-foreground">Case Title</Label>
              <div className="text-lg font-semibold">{caseData.title}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Plaintiff</Label>
              <div className="text-lg">{caseData.plaintiff}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Defendant</Label>
              <div className="text-lg">{caseData.defendant}</div>
            </div>
            {caseData.courtName && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Court</Label>
                <div className="text-lg">{caseData.courtName}</div>
              </div>
            )}
            {caseData.judgeName && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Judge</Label>
                <div className="text-lg">{caseData.judgeName}</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setIsEditing(true)}
            data-testid="button-edit-case"
          >
            <i className="fas fa-edit mr-2"></i>
            Edit Case Details
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => onCaseCreated(caseData)}
            data-testid="button-continue-to-step-2"
          >
            Continue to Step 2: Upload Documents
            <i className="fas fa-arrow-right ml-2"></i>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <i className="fas fa-briefcase text-primary-foreground text-xl"></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 1: {caseData ? "Edit Case Details" : "Create Legal Case"}
            </h1>
            <p className="text-lg text-muted-foreground">
              {caseData ? "Update your case information" : "Set up your legal case with essential details"}
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Case Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="caseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="2024-CV-123456" {...field} data-testid="input-case-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="filingDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filing Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-filing-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Case Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Plaintiff v. Defendant" {...field} data-testid="input-case-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="plaintiff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plaintiff *</FormLabel>
                    <FormControl>
                      <Input placeholder="Plaintiff name" {...field} data-testid="input-plaintiff" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defendant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Defendant *</FormLabel>
                    <FormControl>
                      <Input placeholder="Defendant name" {...field} data-testid="input-defendant" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="courtName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Superior Court of..." {...field} data-testid="input-court-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="judgeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Judge Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Honorable..." {...field} data-testid="input-judge-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex gap-4">
            {caseData && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-create-case"
            >
              {mutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  {caseData ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <i className="fas fa-save mr-2"></i>
                  {caseData ? "Update Case" : "Create Case & Continue"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}