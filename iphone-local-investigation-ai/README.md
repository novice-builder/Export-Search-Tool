# Trace — iPhone-only local AI test

Standalone HTML page at `iphone-local-investigation-ai/index.html`. This prototype is intentionally separate from the existing search tool. The repository's `main` branch and existing pages have not been altered.

## On iPhone (Safari / iOS 26+)
1. Open this HTML page from an HTTPS static web host. GitHub's source-code viewer will not execute the page.
2. Use **Load sample evidence** first (fictional demonstration), or upload small TXT, MD, JSON, JSONL, CSV, HTML, ZIP, DOCX or text PDF files.
3. In **Settings**, confirm the WebGPU check and tap **Download / load model**. Default: Qwen 2.5 0.5B.
4. Select source records, choose an analysis task, and tap **Run on iPhone**.
5. Review every AI-generated draft before saving it as a finding. Export a backup.

## Locality and privacy
Uploaded source text, model prompts and inference results are processed on the device. The app loads the WebLLM runtime and model weights from external providers. Do **not** put sensitive investigation material in a test of unverified external code providers. The entire site source is public on GitHub; your uploads are **not** committed to GitHub.

## Practical limits
- The model is tiny, roughly 0.5B parameters by default, with a maximum targeted context of 4,096 tokens. It will not reason like ChatGPT.
- Longer documents are split into batches; multi-batch syntheses can omit details. Original records are stored separately.
- Browser WebGPU and on-device RAM limitations may prevent the model loading on some iPhones; actual device execution has not been independently verified.
- Initial model loading needs internet. Subsequent offline availability depends on browser cache persistence.
- File imports are capped at 14 MB per file; certain archive formats have additional explicit limits. Scanned PDFs do not support OCR.
- Browser storage may be evicted; retain exported backups.

## Publishing
This is an isolated feature branch. GitHub Pages does not automatically serve unconfigured feature branches. To publish without disrupting an existing Pages site, use an independent static preview host, or explicitly deploy this folder through a separate configuration. Avoid changing the repository's Pages publishing branch if it already hosts another site.
