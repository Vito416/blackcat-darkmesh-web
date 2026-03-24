import { CatalogItem } from "../types/manifest";

const seed: CatalogItem[] = [
  {
    id: "hero-cta",
    type: "block.hero",
    name: "Hero CTA",
    summary: "Large headline with supporting text and primary / secondary actions.",
    tags: ["layout", "marketing"],
    defaultProps: {
      headline: "Launch your Blackcat space",
      subhead: "Drop your assets, pick a preset, ship to AO in minutes.",
      primaryAction: "Get started",
      secondaryAction: "Preview",
      background: "dark",
    },
  },
  {
    id: "feature-grid",
    type: "block.featureGrid",
    name: "Feature Grid",
    summary: "Three-up grid with icon, title, and body copy.",
    tags: ["layout", "grid"],
    defaultProps: {
      columns: 3,
      tone: "neutral",
    },
  },
  {
    id: "gallery",
    type: "block.gallery",
    name: "Gallery",
    summary: "Responsive gallery strip with captions.",
    tags: ["media"],
    defaultProps: {
      items: ["image-01.jpg", "image-02.jpg", "image-03.jpg"],
      caption: "Swipe to explore",
    },
  },
  {
    id: "pricing",
    type: "block.pricing",
    name: "Pricing",
    summary: "Cards for free / pro / team with CTA hooks.",
    tags: ["commerce"],
    defaultProps: {
      plans: ["Free", "Pro", "Team"],
      highlight: "Pro",
    },
  },
  {
    id: "footer",
    type: "block.footer",
    name: "Footer",
    summary: "Columns for links, contact, and socials.",
    tags: ["layout"],
    defaultProps: {
      columns: 4,
    },
  },
];

export async function fetchCatalog(query?: string): Promise<CatalogItem[]> {
  const normalized = query?.trim().toLowerCase();

  return new Promise((resolve) => {
    setTimeout(() => {
      if (!normalized) {
        resolve(seed);
        return;
      }

      resolve(
        seed.filter(
          (item) =>
            item.name.toLowerCase().includes(normalized) ||
            item.tags?.some((tag) => tag.toLowerCase().includes(normalized)),
        ),
      );
    }, 280);
  });
}

export const catalogItems = seed;
