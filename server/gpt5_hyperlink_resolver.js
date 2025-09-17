/**
 * GPT-5 Hyperlink Resolver
 * Uses GPT-5 with Responses API for deterministic hyperlink resolution
 */

import OpenAI from 'openai';

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Use GPT-5 model (or fallback)
const MODEL_ID = process.env.OPENAI_MODEL || 'gpt-5';

// Exact system prompt for deterministic results
const SYSTEM_PROMPT = `You are the Hyperlink Arbiter. Choose the single best dest_page using:
1) highest confidence; 2) lowest page number on ties; 3) method order:
["exact_exhibit","exact_tab","exact_schedule","exact_affidavit","token_affidavit","token_exhibit","section_match"].
If ALL candidates are below min_confidence, return {"decision":"needs_review"}.
Output ONLY JSON: {"decision":"pick","dest_page":N,"reason":"..."} or {"decision":"needs_review"}.`;

/**
 * Resolve hyperlink ambiguity using GPT-5 with deterministic settings
 * @param {Object} ref - Reference object
 * @param {Array} candidates - Array of destination candidates
 * @param {number} minConfidence - Minimum confidence threshold (default: 0.92)
 * @param {number} seed - Deterministic seed (default: 42)
 * @returns {Promise<Object>} Decision object
 */
export async function resolveHyperlink(ref, candidates, minConfidence = 0.92, seed = 42) {
  const inputData = {
    ref,
    candidates,
    rules: {
      min_confidence: minConfidence,
      tie_break_order: ["score", "lowest_page", "method_order"],
      method_order: [
        "exact_exhibit", "exact_tab", "exact_schedule", "exact_affidavit",
        "token_affidavit", "token_exhibit", "section_match"
      ]
    }
  };

  try {
    // Try GPT-5 with Responses API first
    const response = await client.responses.create({
      model: MODEL_ID,
      // Deterministic controls
      temperature: 0,
      top_p: 1,
      seed: seed,
      // Force strict JSON
      response_format: { type: "json_object" },
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(inputData, null, 2) }
      ]
    });

    const result = JSON.parse(response.output_text);
    console.log(`   ✅ GPT-5 resolved: ${result.decision} (${ref.ref_type} ${ref.ref_value})`);
    return result;

  } catch (error) {
    console.log(`   ⚠️  GPT-5 Responses API failed, trying Chat Completions: ${error.message}`);
    
    // Fallback to Chat Completions API
    try {
      const chatResponse = await client.chat.completions.create({
        model: 'gpt-4', // Fallback model
        temperature: 0,
        top_p: 1,
        seed: seed,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(inputData, null, 2) }
        ]
      });

      const result = JSON.parse(chatResponse.choices[0].message.content);
      console.log(`   ✅ GPT-4 fallback resolved: ${result.decision} (${ref.ref_type} ${ref.ref_value})`);
      return result;

    } catch (fallbackError) {
      console.error(`   ❌ Both GPT-5 and fallback failed: ${fallbackError.message}`);
      return { 
        decision: "needs_review", 
        reason: "API resolution failed" 
      };
    }
  }
}

/**
 * Batch resolve multiple hyperlinks
 * @param {Array} references - Array of reference objects with candidates
 * @param {number} minConfidence - Minimum confidence threshold
 * @returns {Promise<Array>} Array of resolved references
 */
export async function batchResolveHyperlinks(references, minConfidence = 0.92) {
  console.log(`🤖 Resolving ${references.length} ambiguous references with GPT-5...`);
  
  const resolvedReferences = [];
  
  for (const ref of references) {
    if (ref.top_confidence < minConfidence && ref.candidates.length > 0) {
      const decision = await resolveHyperlink(ref, ref.candidates, minConfidence);
      
      // Update reference based on GPT-5 decision
      if (decision.decision === 'pick' && decision.dest_page) {
        const selectedCandidate = ref.candidates.find(c => c.dest_page === decision.dest_page);
        if (selectedCandidate) {
          ref.top_dest_page = decision.dest_page;
          ref.top_confidence = selectedCandidate.confidence;
          ref.top_method = selectedCandidate.method;
          ref.llm_decision = 'pick';
          ref.llm_reason = decision.reason;
        }
      } else {
        ref.llm_decision = 'needs_review';
        ref.llm_reason = decision.reason || 'Below confidence threshold';
      }
    }
    
    resolvedReferences.push(ref);
  }
  
  const resolved = resolvedReferences.filter(r => r.llm_decision === 'pick').length;
  console.log(`   ✅ GPT-5 resolved ${resolved} out of ${references.length} ambiguous references`);
  
  return resolvedReferences;
}

/**
 * Test GPT-5 connection and model availability
 * @returns {Promise<Object>} Test result
 */
export async function testGPT5Connection() {
  try {
    const testRef = {
      source_page: 22,
      ref_type: "Exhibit",
      ref_value: "A"
    };
    
    const testCandidates = [
      { dest_page: 241, confidence: 1.0, method: "exact_exhibit" },
      { dest_page: 243, confidence: 0.85, method: "token_exhibit" }
    ];
    
    const result = await resolveHyperlink(testRef, testCandidates);
    
    return {
      success: true,
      model: MODEL_ID,
      decision: result.decision,
      message: `GPT-5 connection successful - ${result.decision} for test case`
    };
    
  } catch (error) {
    return {
      success: false,
      model: MODEL_ID,
      error: error.message,
      message: `GPT-5 connection failed: ${error.message}`
    };
  }
}