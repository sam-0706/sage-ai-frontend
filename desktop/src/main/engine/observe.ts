import type { Page } from 'playwright'

export interface ObservedElement {
  ref: number
  tag: string
  type?: string
  id?: string
  name?: string
  label?: string
  placeholder?: string
  value?: string
  role?: string
  text?: string
  required?: boolean
  checked?: boolean
  option?: string // for radio/checkbox: the option's own label (Yes/No/…)
  options?: string[]
}

export interface Observation {
  url: string
  title: string
  elements: ObservedElement[]
  screenshot: Buffer
}

/**
 * Snapshot the page: tag every interactive element with a stable numeric ref
 * (data-auta-ref) and return a pruned list plus a screenshot. Radios/checkboxes
 * report their checked state and their GROUP QUESTION (not just "Yes"/"No") so
 * the planner can answer once and move on instead of toggling forever.
 */
export async function observe(page: Page): Promise<Observation> {
  const elements = (await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const r = el.getBoundingClientRect()
      const s = window.getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const clean = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim()
    const deepQueryAll = (selector: string, start: Document | ShadowRoot | Element = document): Element[] => {
      const found: Element[] = []
      const visit = (root: Document | ShadowRoot | Element) => {
        if (root instanceof Element && root.shadowRoot) visit(root.shadowRoot)
        for (const element of Array.from(root.querySelectorAll(selector))) found.push(element)
        for (const element of Array.from(root.querySelectorAll('*'))) {
          if (element.shadowRoot) visit(element.shadowRoot)
        }
      }
      visit(start)
      return Array.from(new Set(found))
    }

    // Refs are snapshot-local. Leaving an old ref on a background screen makes
    // a later locator ambiguous when a SPA reuses the same number in a modal.
    for (const stale of deepQueryAll('[data-auta-ref]')) stale.removeAttribute('data-auta-ref')

    const directLabel = (el: HTMLElement): string => {
      const tree = el.getRootNode() as Document | ShadowRoot
      const id = el.getAttribute('id')
      if (id) {
        const lab = tree.querySelector(`label[for="${CSS.escape(id)}"]`)
        if (lab?.textContent) return clean(lab.textContent)
      }
      const parentLabel = el.closest('label')
      if (parentLabel?.textContent) return clean(parentLabel.textContent)
      const aria = el.getAttribute('aria-label')
      if (aria) return clean(aria)
      const labelledby = el.getAttribute('aria-labelledby')
      if (labelledby) {
        const ref = tree.querySelector(`#${CSS.escape(labelledby)}`)
        if (ref?.textContent) return clean(ref.textContent)
      }
      return ''
    }

    // For grouped inputs (radio/checkbox), find the QUESTION text from the
    // enclosing question container, excluding the option's own label.
    const groupQuestion = (el: HTMLElement): string => {
      const containers = [
        el.closest('fieldset'),
        el.closest('[role="group"]'),
        el.closest('[data-field-path]'),
        el.closest('.ashby-application-form-field-entry'),
        el.closest('.application-question, .field, li, .form-group')
      ].filter(Boolean) as Element[]
      for (const container of containers) {
        const heading = container.querySelector(
          'legend, .ashby-application-form-question-title, .application-label, [data-question], .text, label'
        )
        const q = clean(heading?.textContent)
        // avoid returning the option itself as the group question
        if (q && !/^(yes|no|on|off)$/i.test(q)) return q.slice(0, 220)
      }
      return ''
    }

    const sel =
      'input, textarea, select, button, a[href], [role="button"], [role="combobox"], [role="checkbox"], [role="radio"], [contenteditable="true"]'
    // When a modal is open, background controls may remain technically
    // visible but cannot receive pointer events. Observe only the active modal
    // so the agent reasons about the foreground task instead of repeatedly
    // clicking an obscured Apply button. Supports native <dialog> and ARIA
    // modal implementations without portal-specific selectors.
    const modalCandidates = deepQueryAll(
      [
        'dialog[open]',
        '[role="dialog"]',
        '[aria-modal="true"]',
        // LinkedIn Easy Apply uses a top-layer container without role=dialog.
        // Without these selectors the background messaging controls are
        // indexed even though the application modal intercepts every click.
        '[data-test-modal-id="easy-apply-modal"]',
        '[data-test-modal-container][aria-hidden="false"]',
        '.artdeco-modal-overlay--is-top-layer'
      ].join(', ')
    ).filter(isVisible) as HTMLElement[]
    // Prefer LinkedIn's explicit active Easy Apply marker even when its outer
    // overlay reports a zero/transitioning rectangle. Its descendants are the
    // only controls that can receive input while the overlay is mounted.
    const linkedInEasyApply = deepQueryAll(
      '[data-test-modal-id="easy-apply-modal"][aria-hidden="false"]'
    ).at(-1) as HTMLElement | undefined
    // Some component libraries nest a small/empty aria-modal node inside the
    // actual native dialog. DOM order is therefore not a reliable indication
    // of the active interaction surface. Pick the visible modal that contains
    // the most usable controls, with rendered area as a tie-breaker.
    const root: ParentNode = linkedInEasyApply ?? modalCandidates
      .map((candidate) => {
        const controls = deepQueryAll(sel, candidate).filter(isVisible).length
        const rect = candidate.getBoundingClientRect()
        return { candidate, controls, area: rect.width * rect.height }
      })
      .sort((a, b) => b.controls - a.controls || b.area - a.area)[0]?.candidate ?? document
    const nodes = deepQueryAll(sel, root as Document | ShadowRoot | Element) as HTMLElement[]
    const out: Array<Record<string, unknown>> = []
    let ref = 0
    for (const el of nodes) {
      const input = el as HTMLInputElement
      const type = (input.type || '').toLowerCase()
      const isFileInput = el.tagName === 'INPUT' && type === 'file'
      if (el.getAttribute('aria-hidden') === 'true' && !isFileInput) continue
      if (!isVisible(el) && !isFileInput) continue

      el.setAttribute('data-auta-ref', String(ref))
      const tag = el.tagName.toLowerCase()
      const isPressedChoice =
        el.matches('button[data-option], .ashby-application-form-input-yesno-option') ||
        el.hasAttribute('aria-pressed')
      const isChoice =
        type === 'radio' ||
        type === 'checkbox' ||
        el.getAttribute('role') === 'radio' ||
        el.getAttribute('role') === 'checkbox' ||
        isPressedChoice

      const rec: Record<string, unknown> = {
        ref,
        tag,
        type: input.type || undefined,
        id: el.getAttribute('id') || undefined,
        name: el.getAttribute('name') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        role: el.getAttribute('role') || undefined,
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
      }

      if (isChoice) {
        rec.checked =
          input.checked ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true'
        const rawValue = clean(input.value)
        rec.option =
          clean(el.getAttribute('data-option')) ||
          (rawValue && rawValue.toLowerCase() !== 'on' ? rawValue : '') ||
          directLabel(el) ||
          clean(el.textContent) ||
          undefined
        rec.label = groupQuestion(el) || directLabel(el) || undefined
      } else {
        rec.label = directLabel(el) || undefined
        const selectedValue = el.getAttribute('role') === 'combobox'
          ? (() => {
              const control =
                el.closest('.select__control, [class*="control" i]') ||
                el.parentElement?.parentElement ||
                el.parentElement
              const scope = control?.parentElement || control
              const selected = scope?.querySelector(
                '.select__single-value, [class*="singleValue" i], [class*="single-value" i], [data-value]'
              )
              const hidden = scope?.querySelector('input[type="hidden"]') as HTMLInputElement | null
              return clean(
                el.getAttribute('aria-valuetext') ||
                selected?.textContent ||
                hidden?.value ||
                (el.tagName !== 'INPUT' && !/^\s*(select|choose|pick)(\.{3}| an? option)?\s*$/i.test(el.textContent || '')
                  ? el.textContent
                  : '')
              )
            })()
          : ''
        // Password material belongs exclusively to the deterministic credential
        // broker. The model only needs to know whether the field is filled.
        rec.value = type === 'password'
          ? (input.value ? '••••••••' : undefined)
          : (selectedValue || clean(input.value)).slice(0, 220) || undefined
        if (tag === 'select') {
          rec.options = Array.from((el as HTMLSelectElement).options)
            .map((option) => clean(option.textContent || option.value))
            .filter(Boolean)
            .slice(0, 80)
        }
        rec.text = clean(el.textContent).slice(0, 80) || undefined
      }

      out.push(rec)
      ref++
      if (ref > 220) break
    }
    return out
  })) as unknown as ObservedElement[]

  const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 })
  return { url: page.url(), title: await page.title(), elements, screenshot }
}
