import { tFor, type Language } from "./index";

export function objectiveTemplate(language: Language) {
  return tFor(language, "template.objective");
}

export function subjectiveTemplate(language: Language) {
  return tFor(language, "template.subjective");
}

export function defaultJudgeTemplate(language: Language, type?: string) {
  return type === "OBJECTIVE" ? objectiveTemplate(language) : subjectiveTemplate(language);
}

export function twentyFourPointPrompt(language: Language) {
  return tFor(language, "template.twentyFourPrompt");
}

export function questionCsvTemplate(language: Language) {
  if (language === "zh") {
    return [
      '"题目","参考答案","private"',
      '"请描述大语言模型的主要特点","基于Transformer架构、通过大规模语料预训练的语言模型",0',
      '"什么是 RAG？","检索增强生成，将外部检索与语言模型生成结合的技术",0',
    ].join("\n");
  }
  return [
    '"Question","Reference answer","private"',
    '"Describe the main characteristics of large language models","Transformer-based language models pretrained on large-scale corpora",0',
    '"What is RAG?","Retrieval-augmented generation combines external retrieval with language model generation",0',
  ].join("\n");
}
