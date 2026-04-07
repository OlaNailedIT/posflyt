import { useEffect } from "react";

const DEFAULT_TITLE = "POSflyt – Smart POS & Inventory";

/**
 * Imperative SEO helpers (legacy). Marketing routes use `SeoHead` + `react-helmet-async` for
 * title, description, canonical, Open Graph, Twitter, and JSON-LD.
 * @param {{ title?: string, description?: string, keywords?: string }} opts
 */
export function setSEO({ title, description, keywords } = {}) {
  document.title = title || DEFAULT_TITLE;

  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement("meta");
    metaDesc.setAttribute("name", "description");
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute("content", description || "");

  if (keywords !== undefined) {
    let metaKw = document.querySelector('meta[name="keywords"]');
    if (!metaKw) {
      metaKw = document.createElement("meta");
      metaKw.setAttribute("name", "keywords");
      document.head.appendChild(metaKw);
    }
    metaKw.setAttribute("content", keywords || "");
  }
}

/**
 * @deprecated Prefer `<SeoHead />` on marketing pages for full meta + structured data.
 * @param {{ title?: string, description?: string, keywords?: string }} opts
 */
export function useSEO({ title, description, keywords }) {
  useEffect(() => {
    setSEO({ title, description, keywords });
  }, [title, description, keywords]);
}
