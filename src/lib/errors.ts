export class ItemNotFoundError extends Error {
  readonly itemId: string;
  constructor(itemId: string) {
    super(`Item not found: ${itemId}`);
    this.name = "ItemNotFoundError";
    this.itemId = itemId;
  }
}
