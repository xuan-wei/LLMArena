"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { translatePhraseToEnglish } from "@/lib/i18n/phrases";

const originalText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const ATTR_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);
const ATTRS = ["placeholder", "aria-label", "title"];
const HAN_RE = /[\u4e00-\u9fff]/;

function applyText(node: Text, language: string, base: string) {
  const current = node.nodeValue ?? "";
  const translated = translatePhraseToEnglish(base);
  const next = language === "en" ? (translated !== base ? translated : current) : (HAN_RE.test(base) && current === translated ? base : current);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function applyAttr(el: Element, attr: string, language: string, base: string) {
  const current = el.getAttribute(attr) ?? "";
  const translated = translatePhraseToEnglish(base);
  const next = language === "en" ? (translated !== base ? translated : current) : (HAN_RE.test(base) && current === translated ? base : current);
  if (current !== next) el.setAttribute(attr, next);
}

function rememberAttr(el: Element, attr: string, value: string) {
  let map = originalAttr.get(el);
  if (!map) {
    map = new Map();
    originalAttr.set(el, map);
  }
  if (!map.has(attr)) map.set(attr, value);
}

function translateElement(root: ParentNode, language: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (parent && !SKIP_TAGS.has(parent.tagName)) {
      const base = originalText.get(node) ?? node.nodeValue ?? "";
      if (!originalText.has(node)) originalText.set(node, base);
      applyText(node, language, base);
    }
    node = walker.nextNode() as Text | null;
  }

  if (root instanceof Element || root instanceof Document) {
    const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
    for (const el of elements) {
      if (ATTR_SKIP_TAGS.has(el.tagName)) continue;
      for (const attr of ATTRS) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        rememberAttr(el, attr, value);
        const base = originalAttr.get(el)?.get(attr) ?? value;
        applyAttr(el, attr, language, base);
      }
    }
  }
}

export function I18nClient() {
  const { user, publicLanguage } = useAuth();
  const language = user?.language ?? publicLanguage;

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    translateElement(document, language);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (parent && !SKIP_TAGS.has(parent.tagName)) {
              const textNode = node as Text;
              const base = textNode.nodeValue ?? "";
              originalText.set(textNode, base);
              applyText(textNode, language, base);
            }
          } else if (node instanceof Element) {
            translateElement(node, language);
          }
        }
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          const textNode = mutation.target as Text;
          const current = textNode.nodeValue ?? "";
          const parent = textNode.parentElement;
          if (!parent || SKIP_TAGS.has(parent.tagName)) continue;
          if (language === "en") {
            if (HAN_RE.test(current)) {
              originalText.set(textNode, current);
              applyText(textNode, language, current);
            }
          } else {
            const base = originalText.get(textNode);
            if (base && current === translatePhraseToEnglish(base)) {
              applyText(textNode, language, base);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
}
