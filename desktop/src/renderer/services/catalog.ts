import { CatalogItem } from "../types/manifest";

const seed: CatalogItem[] = [
  {
    id: "hero-cta",
    type: "block.hero",
    name: "Hero CTA",
    summary: "Large headline with supporting text and primary / secondary actions.",
    tags: ["layout", "marketing", "hero"],
    defaultProps: {
      eyebrow: "Darkmesh studio",
      headline: "Launch your Blackcat space",
      subhead: "Drop your assets, pick a preset, ship to AO in minutes.",
      primaryAction: "Get started",
      secondaryAction: "Preview",
      background: "dark",
    },
    propsSchema: {
      type: "object",
      required: ["headline", "subhead", "primaryAction", "secondaryAction", "background"],
      properties: {
        eyebrow: {
          type: "string",
          default: "Darkmesh studio",
        },
        headline: {
          type: "string",
          default: "Launch your Blackcat space",
        },
        subhead: {
          type: "string",
          default: "Drop your assets, pick a preset, ship to AO in minutes.",
        },
        primaryAction: {
          type: "string",
          default: "Get started",
        },
        secondaryAction: {
          type: "string",
          default: "Preview",
        },
        background: {
          type: "string",
          enum: ["dark", "light", "aurora"],
          default: "dark",
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Hero",
      title: "Launch your Blackcat space",
      body: "Drop assets and ship to AO in minutes.",
      meta: ["Get started", "Preview"],
    },
  },
  {
    id: "cta-band",
    type: "block.cta",
    name: "CTA Band",
    summary: "Compact call-to-action banner with optional subcopy.",
    tags: ["cta", "marketing", "banner"],
    defaultProps: {
      eyebrow: "Always-on launchpad",
      headline: "Deploy to the Darkmesh in minutes",
      body: "Bundle manifests, vault credentials, and push live without leaving the studio.",
      primaryAction: "Open studio",
      secondaryAction: "View docs",
      tone: "accent",
      alignment: "center",
    },
    propsSchema: {
      type: "object",
      required: ["headline", "primaryAction"],
      properties: {
        eyebrow: {
          type: "string",
          default: "Always-on launchpad",
        },
        headline: {
          type: "string",
          default: "Deploy to the Darkmesh in minutes",
        },
        body: {
          type: "string",
          default: "Bundle manifests, vault credentials, and push live without leaving the studio.",
        },
        primaryAction: {
          type: "string",
          default: "Open studio",
        },
        primaryHref: {
          type: "string",
          default: "#",
        },
        secondaryAction: {
          type: "string",
          default: "View docs",
        },
        secondaryHref: {
          type: "string",
          default: "#",
        },
        tone: {
          type: "string",
          enum: ["accent", "neutral", "contrast"],
          default: "accent",
        },
        alignment: {
          type: "string",
          enum: ["left", "center", "right"],
          default: "center",
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "CTA",
      title: "Deploy to the Darkmesh in minutes",
      body: "Bundle manifests and vault credentials in one flow.",
      meta: ["Open studio", "View docs"],
    },
  },
  {
    id: "feature-grid",
    type: "block.featureGrid",
    name: "Feature Grid",
    summary: "Three-up grid with icon, title, and body copy.",
    tags: ["layout", "grid", "features"],
    defaultProps: {
      columns: 3,
      tone: "neutral",
      items: [
        { title: "Vault aware", body: "Encrypt drafts, back up bundles, and restore fast." },
        { title: "Health checked", body: "Latency and SLA tracking built into every deploy." },
        { title: "AO native", body: "Publish manifests and spawn processes from one console." },
      ],
    },
    propsSchema: {
      type: "object",
      required: ["columns", "tone"],
      properties: {
        columns: {
          type: "number",
          default: 3,
        },
        tone: {
          type: "string",
          enum: ["neutral", "contrast", "glow"],
          default: "neutral",
        },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: {
                type: "string",
                default: "Feature title",
              },
              body: {
                type: "string",
                default: "Describe the capability.",
              },
            },
            additionalProperties: false,
          },
          default: [
            { title: "Vault aware", body: "Encrypt drafts, back up bundles, and restore fast." },
            { title: "Health checked", body: "Latency and SLA tracking built into every deploy." },
            { title: "AO native", body: "Publish manifests and spawn processes from one console." },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Grid",
      title: "Vault aware · Health checked · AO native",
      body: "Three-up feature grid.",
    },
  },
  {
    id: "stats",
    type: "block.stats",
    name: "Stats",
    summary: "KPI tiles with trend deltas for telemetry or usage.",
    tags: ["data", "metrics", "dashboard"],
    defaultProps: {
      headline: "Live stats",
      tone: "glow",
      stats: [
        { label: "Deploys", value: "184", delta: "+12%", trend: "up" },
        { label: "Latency", value: "146ms", delta: "-8%", trend: "down" },
        { label: "Uptime", value: "99.98%", delta: "+0.01%", trend: "up" },
      ],
      footnote: "Based on the last 24h health checks.",
    },
    propsSchema: {
      type: "object",
      required: ["stats"],
      properties: {
        headline: {
          type: "string",
          default: "Live stats",
        },
        tone: {
          type: "string",
          enum: ["glow", "neutral", "contrast"],
          default: "glow",
        },
        footnote: {
          type: "string",
          default: "Based on the last 24h health checks.",
        },
        stats: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["label", "value"],
            properties: {
              label: {
                type: "string",
                default: "Metric",
              },
              value: {
                type: "string",
                default: "100",
              },
              delta: {
                type: "string",
                default: "+0%",
              },
              trend: {
                type: "string",
                enum: ["up", "down", "flat"],
                default: "up",
              },
            },
            additionalProperties: false,
          },
          default: [
            { label: "Deploys", value: "184", delta: "+12%", trend: "up" },
            { label: "Latency", value: "146ms", delta: "-8%", trend: "down" },
            { label: "Uptime", value: "99.98%", delta: "+0.01%", trend: "up" },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Stats",
      title: "184 deploys · 146ms · 99.98%",
      body: "Trend deltas for the last 24h.",
    },
  },
  {
    id: "timeline",
    type: "block.timeline",
    name: "Timeline",
    summary: "Roadmap steps with timestamps and descriptions.",
    tags: ["roadmap", "process", "sequence"],
    defaultProps: {
      title: "Rollout timeline",
      variant: "horizontal",
      steps: [
        { title: "Draft", detail: "Assemble hero, grid, pricing", at: "Day 0" },
        { title: "Audit", detail: "Health checks + allowlist", at: "Day 2" },
        { title: "Deploy", detail: "Ship to mainnet", at: "Day 5" },
      ],
      showProgress: true,
    },
    propsSchema: {
      type: "object",
      required: ["steps"],
      properties: {
        title: {
          type: "string",
          default: "Rollout timeline",
        },
        variant: {
          type: "string",
          enum: ["horizontal", "vertical"],
          default: "horizontal",
        },
        showProgress: {
          type: "boolean",
          default: true,
        },
        steps: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: {
                type: "string",
                default: "Step title",
              },
              detail: {
                type: "string",
                default: "Describe the milestone.",
              },
              at: {
                type: "string",
                default: "Day 0",
              },
            },
            additionalProperties: false,
          },
          default: [
            { title: "Draft", detail: "Assemble hero, grid, pricing", at: "Day 0" },
            { title: "Audit", detail: "Health checks + allowlist", at: "Day 2" },
            { title: "Deploy", detail: "Ship to mainnet", at: "Day 5" },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Timeline",
      title: "Draft → Audit → Deploy",
      body: "Horizontal roadmap with timestamps.",
    },
  },
  {
    id: "gallery",
    type: "block.gallery",
    name: "Gallery",
    summary: "Responsive gallery strip with captions.",
    tags: ["media", "carousel", "showcase"],
    defaultProps: {
      headline: "Recent drops",
      layout: "carousel",
      autoplay: true,
      items: [
        { src: "image-01.jpg", caption: "Launchpad UI", alt: "Launchpad UI preview" },
        { src: "image-02.jpg", caption: "Vault crystal", alt: "Vault crystal render" },
        { src: "image-03.jpg", caption: "AO holomap", alt: "AO holomap nodes" },
      ],
    },
    propsSchema: {
      type: "object",
      required: ["items"],
      properties: {
        headline: {
          type: "string",
          default: "Recent drops",
        },
        layout: {
          type: "string",
          enum: ["carousel", "grid", "masonry"],
          default: "carousel",
        },
        autoplay: {
          type: "boolean",
          default: true,
        },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["src"],
            properties: {
              src: {
                type: "string",
                default: "image-01.jpg",
              },
              caption: {
                type: "string",
                default: "Add a caption",
              },
              alt: {
                type: "string",
                default: "Gallery item",
              },
            },
            additionalProperties: false,
          },
          default: [
            { src: "image-01.jpg", caption: "Launchpad UI", alt: "Launchpad UI preview" },
            { src: "image-02.jpg", caption: "Vault crystal", alt: "Vault crystal render" },
            { src: "image-03.jpg", caption: "AO holomap", alt: "AO holomap nodes" },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Gallery",
      title: "Launchpad UI · Vault crystal · AO holomap",
      body: "Autoplay carousel with captions.",
    },
  },
  {
    id: "pricing",
    type: "block.pricing",
    name: "Pricing",
    summary: "Cards for free / pro / team with CTA hooks.",
    tags: ["commerce", "plans", "checkout"],
    defaultProps: {
      headline: "Pick your launch lane",
      subhead: "Start free, scale when ready.",
      badge: "Most popular",
      layout: "grid",
      plans: [
        {
          name: "Hobby",
          price: "$0",
          cadence: "forever",
          description: "Build personal and test spaces.",
          ctaLabel: "Start free",
          features: ["1 manifest", "Local deploy", "Community support"],
          featured: false,
        },
        {
          name: "Growth",
          price: "$24",
          cadence: "month",
          description: "Team workflows with vault + health monitors.",
          ctaLabel: "Upgrade",
          features: ["Vault backups", "Health checks", "3 manifests"],
          featured: true,
        },
        {
          name: "Enterprise",
          price: "Talk to us",
          cadence: "custom",
          description: "SLA, dedicated region, and private allowlist review.",
          ctaLabel: "Book call",
          features: ["SLA + support", "Custom allowlist", "Private deploy"],
          featured: false,
        },
      ],
    },
    propsSchema: {
      type: "object",
      required: ["plans"],
      properties: {
        headline: {
          type: "string",
          default: "Pick your launch lane",
        },
        subhead: {
          type: "string",
          default: "Start free, scale when ready.",
        },
        badge: {
          type: "string",
          default: "Most popular",
        },
        layout: {
          type: "string",
          enum: ["grid", "stacked"],
          default: "grid",
        },
        plans: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["name", "price", "ctaLabel"],
            properties: {
              name: {
                type: "string",
                default: "Plan",
              },
              price: {
                type: "string",
                default: "$0",
              },
              cadence: {
                type: "string",
                default: "month",
              },
              description: {
                type: "string",
                default: "Describe the plan.",
              },
              ctaLabel: {
                type: "string",
                default: "Choose plan",
              },
              featured: {
                type: "boolean",
                default: false,
              },
              features: {
                type: "array",
                minItems: 1,
                items: {
                  type: "string",
                },
                default: ["Feature one", "Feature two"],
              },
            },
            additionalProperties: false,
          },
          default: [
            {
              name: "Hobby",
              price: "$0",
              cadence: "forever",
              description: "Build personal and test spaces.",
              ctaLabel: "Start free",
              features: ["1 manifest", "Local deploy", "Community support"],
              featured: false,
            },
            {
              name: "Growth",
              price: "$24",
              cadence: "month",
              description: "Team workflows with vault + health monitors.",
              ctaLabel: "Upgrade",
              features: ["Vault backups", "Health checks", "3 manifests"],
              featured: true,
            },
            {
              name: "Enterprise",
              price: "Talk to us",
              cadence: "custom",
              description: "SLA, dedicated region, and private allowlist review.",
              ctaLabel: "Book call",
              features: ["SLA + support", "Custom allowlist", "Private deploy"],
              featured: false,
            },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Pricing",
      title: "Hobby · Growth · Enterprise",
      body: "Grid layout with featured plan badge.",
      meta: ["Most popular"],
    },
  },
  {
    id: "contact",
    type: "block.contact",
    name: "Contact",
    summary: "Contact methods and optional intake form.",
    tags: ["support", "engagement", "form"],
    defaultProps: {
      headline: "Contact the ops team",
      summary: "Need white-glove deploy or allowlist help? Reach out.",
      methods: [
        { label: "Email", value: "ops@blackcat.ao", type: "email" },
        { label: "Telegram", value: "@blackcatops", type: "chat" },
        { label: "Book a call", value: "https://cal.com/blackcat", type: "link" },
      ],
      showForm: true,
      formTitle: "Send a request",
    },
    propsSchema: {
      type: "object",
      required: ["methods"],
      properties: {
        headline: {
          type: "string",
          default: "Contact the ops team",
        },
        summary: {
          type: "string",
          default: "Need white-glove deploy or allowlist help? Reach out.",
        },
        formTitle: {
          type: "string",
          default: "Send a request",
        },
        showForm: {
          type: "boolean",
          default: true,
        },
        methods: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["label", "value"],
            properties: {
              label: {
                type: "string",
                default: "Email",
              },
              value: {
                type: "string",
                default: "ops@blackcat.ao",
              },
              type: {
                type: "string",
                enum: ["email", "chat", "link", "phone"],
                default: "email",
              },
            },
            additionalProperties: false,
          },
          default: [
            { label: "Email", value: "ops@blackcat.ao", type: "email" },
            { label: "Telegram", value: "@blackcatops", type: "chat" },
            { label: "Book a call", value: "https://cal.com/blackcat", type: "link" },
          ],
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Contact",
      title: "Email · Telegram · Book a call",
      body: "Optional intake form included.",
    },
  },
  {
    id: "footer",
    type: "block.footer",
    name: "Footer",
    summary: "Columns for links, contact, and socials.",
    tags: ["layout", "navigation"],
    defaultProps: {
      columns: 4,
    },
    propsSchema: {
      type: "object",
      required: ["columns"],
      properties: {
        columns: {
          type: "number",
          default: 4,
        },
      },
      additionalProperties: false,
    },
    preview: {
      badge: "Footer",
      title: "Links · Contact · Socials",
      body: "Four column layout.",
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
        seed.filter((item) => {
          const fields = [
            item.name,
            item.summary,
            item.type,
            ...(item.tags ?? []),
            item.preview?.title ?? "",
            item.preview?.body ?? "",
            ...(item.preview?.meta ?? []),
          ];
          return fields.some((field) => field.toLowerCase().includes(normalized));
        }),
      );
    }, 280);
  });
}

export const catalogItems = seed;
