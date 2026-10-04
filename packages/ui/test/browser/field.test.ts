// Upstream: packages/react/src/field/label/FieldLabel.test.tsx,
// packages/react/src/field/description/FieldDescription.test.tsx,
// packages/react/src/field/error/FieldError.test.tsx,
// packages/react/src/number-field/root/NumberFieldRoot.test.tsx (describe 'Field')
//
// The field's cases against a number field, the one control this package
// has. Dropped: native constraint validation, Form errors, Field.Control,
// Field.Item, Field.Validity, the touched/dirty/filled/focused states and
// `nativeLabel={false}` (not ported), and the error's transition states.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { type Harness, harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('field.tsx');
});
afterAll(async () => {
  await h.close();
});

describe('Field.Label', () => {
  it('should set htmlFor referencing the control automatically', async () => {
    const page = await h.open('field');
    await see(page.locator('#label')).toHaveAttribute('for', 'input');
    await see(page.locator('#input')).toHaveAttribute('aria-labelledby', 'label');
    await see(page.getByRole('textbox', { name: 'Offset' })).toHaveCount(1);
  });

  it('focuses the control on click', async () => {
    const page = await h.open('field');
    await page.click('#label');
    await see(page.locator('#input')).toBeFocused();
  });
});

describe('Field.Description', () => {
  it('should set aria-describedby on the control automatically', async () => {
    const page = await h.open('field');
    await see(page.locator('#input')).toHaveAttribute('aria-describedby', 'description');
  });

  it('should preserve user aria-describedby values on the control', async () => {
    const page = await h.open('field', { query: { describedby: 'own' } });
    await see(page.locator('#input')).toHaveAttribute('aria-describedby', 'own description');
  });
});

describe('Field.Error', () => {
  it('shows only while the field is invalid, and describes the control while shown', async () => {
    const page = await h.open('field');
    await see(page.locator('#error')).toHaveCount(0);
    await see(page.locator('#input')).not.toHaveAttribute('aria-invalid', 'true');
    await page.evaluate(() =>
      (window as unknown as { __set: (next: { invalid: boolean }) => void }).__set({
        invalid: true,
      }),
    );
    await see(page.locator('#error')).toHaveText('Past the scene end');
    await see(page.locator('#input')).toHaveAttribute('aria-invalid', 'true');
    await see(page.locator('#input')).toHaveAttribute('aria-describedby', 'description error');
    await see(page.locator('#field')).toHaveAttribute('data-invalid', '');
    await page.evaluate(() =>
      (window as unknown as { __set: (next: { invalid: boolean }) => void }).__set({
        invalid: false,
      }),
    );
    await see(page.locator('#error')).toHaveCount(0);
    await see(page.locator('#input')).toHaveAttribute('aria-describedby', 'description');
  });

  it('always renders the error message when `match` is true', async () => {
    const page = await h.open('field', { query: { match: 'true' } });
    await see(page.locator('#error')).toBeVisible();
  });

  it('hides while the field is disabled', async () => {
    const page = await h.open('field', { query: { invalid: 'true', disabled: 'true' } });
    await see(page.locator('#error')).toHaveCount(0);
  });
});

describe('Field.Root with NumberField', () => {
  it('disables the input when disabled=true', async () => {
    const page = await h.open('field', { query: { disabled: 'true' } });
    await see(page.locator('#input')).toBeDisabled();
    await see(page.locator('#field')).toHaveAttribute('data-disabled', '');
  });

  it('does not disable the input when disabled=false', async () => {
    const page = await h.open('field');
    await see(page.locator('#input')).toBeEnabled();
  });

  it('names the hidden input from the field', async () => {
    const page = await h.open('field', { query: { name: 'offset' } });
    const submitted = await page.evaluate(() =>
      new FormData(document.getElementById('form') as HTMLFormElement).get('offset'),
    );
    expect(submitted).toBe('0.42');
  });
});
