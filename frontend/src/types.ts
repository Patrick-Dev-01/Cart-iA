export type Product = {
  id: number;
  name: string;
  price: number;
  storeId: number;
  embedding: number[] | null;
  store: {
    id: number;
    name: string;
  }
};

export type Cart = {
    id: number;
    user_id: number;
    created_at: string;
    store_id: number;
    active: boolean;
    total: number;
    store: {
      name: string;
    }
    items: {
        id: number;
        name: string;
        price: number;
        quantity: number;
    }[];
}
