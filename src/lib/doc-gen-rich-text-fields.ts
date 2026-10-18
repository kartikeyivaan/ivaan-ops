export function docGenFieldSpanHtml(field: { id: string; fieldKey: string; label: string }): string {
  return `<span contenteditable="false" data-doc-gen-field="${field.id}" data-doc-gen-key="${field.fieldKey}" class="rounded bg-amber-100 px-1 text-amber-950">{${field.fieldKey}}</span>`;
}
