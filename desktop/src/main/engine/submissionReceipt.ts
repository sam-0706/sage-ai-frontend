/** Runs inside the page. Keep self-contained so Playwright can serialize it. */
export function hasVisibleSubmissionReceipt(): boolean {
  const success = /your application (?:was |has been )?(?:successfully )?(?:submitted|received|sent\b)|application (?:successfully )?(?:submitted|received)|thank you for (?:applying|your application)|thanks for applying|we(?:'|’)ve received your application/i
  const regions = document.querySelectorAll('[role="alert"], [role="status"], [role="dialog"], [class*="success" i], [class*="confirmation" i], [data-testid*="success" i], .artdeco-modal, .jobs-apply-success-feedback, h1, h2, h3, [role="heading"]')
  return Array.from(regions).some(element => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    if (!bounds.width || !bounds.height || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
    return text.length <= 1200 && success.test(text)
  })
}
