# Updating the site

## After every new export from the site builder

1. Replace `index.html` with the new export.
2. Run:

   ```
   node scripts/fix-export.mjs
   ```

3. Read the report. Every line should say `fixed` or `ok`. A `WARNING` line says what still needs doing.
4. Open `index.html` in a browser, check it, then commit.

The script puts back the changes the builder doesn't know about:

- the portrait stops blinking when the visitor's system asks for reduced motion
- the portrait is converted from PNG to WebP (about 1.4 MB down to 125 KB)
- the footer "Hugging Face" link points to the real profile
- the page description and link-preview tags go in the `<head>`
- the plain-text copy for visitors and tools without JavaScript is rebuilt from the site's own text

Running it twice is harmless. Steps that are already done are skipped.

To change the Hugging Face address, page title or description, edit the settings at the top of `fix-export.mjs`.

If the portrait step says no converter was found, run `brew install webp` and try again.

## After editing text directly in index.html

If you change a project or job description in `index.html` itself rather than in the builder, run:

```
node scripts/sync-nojs.mjs
```

That rebuilds only the plain-text copy. `fix-export.mjs` runs this step for you, so you don't need both.

Don't edit the section between the `nojs:start` and `nojs:end` comments by hand. The script overwrites it.

## Experience text to paste into the builder (one time)

These are the rewritten bullets that are live on the site. Paste them into the builder so the next export doesn't bring back the old wording. Until you do, `fix-export.mjs` shows a warning.

**Software Engineer, Isha Foundation**

- Built and deployed an agentic invoice-processing system in Python that replaced spreadsheet workflows across multiple construction sites.
- Built an OCR + GPT-4 Vision pipeline that reads vendor names, line items, and totals from scanned invoices, cutting manual data entry by ~70%.
- Built an analytics dashboard with 12 role-gated views that shows where approvals get stuck. A plugin registry in the FastAPI backend makes each new SQL report appear in the React UI automatically.
- Worked directly with finance and department staff to turn their requirements into an approval workflow: role-based access control and multi-step routing in FastAPI, on a PostgreSQL schema with migration scripts that consolidated historical data.
- Set up CI/CD with GitHub Actions and Docker across staging and production on AWS, replacing manual deployments.

**AI Intern, ActiveSages Solutions**

- Built the core MVP of an LLM healthcare companion for elderly users in Python: a GPT-4 chatbot and a caregiver dashboard, from design through deployment.
- Developed the Flask backend: authentication, session management, conversation history, and the layer that combines OpenAI GPT-4 and Azure Cognitive Services into one conversational service.
- Owned the OpenAPI 3.0 / Swagger documentation, cutting contract-developer ramp-up from ~2 weeks to days.
- Led mobile responsiveness across iOS/Android webviews, reaching a 95% Lighthouse accessibility score, which matters for elderly users.
- Set up HIPAA-compliant database architecture for sensitive health data, with encryption and access controls.
