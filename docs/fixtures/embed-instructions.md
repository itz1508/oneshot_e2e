# Embed Instructions — Researcher Workflow Demo

## Assets

The static embed preview is completely framework-neutral, dependency-free, and self-contained:

- `frontend/web/public/embed/researcher-workflow-demo.html`
- `frontend/web/public/embed/researcher-workflow-demo.css`
- `frontend/web/public/embed/researcher-workflow-demo.js`

When deployed via GitHub Pages, these assets are accessible under `/oneshot_e2e/embed/`.

---

## Embedding via Iframe

```html
<iframe
  src="/oneshot_e2e/embed/researcher-workflow-demo.html"
  title="Accessibility research fixture preview"
  style="width: 100%; min-height: 900px; border: 0;"
  loading="lazy"
></iframe>
```

---

## Technical Notes

- **Source grounding**: All displayed findings link directly to public W3C WCAG 2.2 and MDN documentation over HTTPS.
- **Simulation**: Workflow progress and status transitions run deterministically in the client via vanilla JavaScript.
- **Styling**: Scoped CSS variables allow integration with dark/light themes without leaking global styles.
- **Accessibility**: All controls include descriptive `aria-label` attributes and keyboard navigation support.
