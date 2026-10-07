// Upstream: packages/react/src/utils/popups/popupTriggerMap.ts
//
// The trigger elements of one popup, by id. A popup may have several
// triggers; the one that opened it is the active trigger.
export class PopupTriggerMap {
  private idMap = new Map<string, Element>();

  add(id: string, element: Element) {
    this.idMap.set(id, element);
  }

  delete(id: string) {
    this.idMap.delete(id);
  }

  hasElement(element: Element): boolean {
    for (const registered of this.idMap.values()) {
      if (registered === element) {
        return true;
      }
    }
    return false;
  }

  hasMatchingElement(predicate: (el: Element) => boolean): boolean {
    for (const element of this.idMap.values()) {
      if (predicate(element)) {
        return true;
      }
    }
    return false;
  }

  getById(id: string): Element | undefined {
    return this.idMap.get(id);
  }
}
