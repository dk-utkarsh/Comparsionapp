export interface ProductData {
  name: string;
  url: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  packaging: string;
  inStock: boolean;
  description: string;
  source: string;
}

export interface ComparisonResult {
  id: string;
  searchTerm: string;
  dentalkart: ProductData | null;
  competitors: Record<string, ProductData | null>;
  alerts: PriceAlert[];
  createdAt: string;
}

export interface PriceAlert {
  type: "cheaper_competitor";
  competitor: string;
  competitorPrice: number;
  dentalkartPrice: number;
  priceDiff: number;
}

export interface SavedMatch {
  id: string;
  productName: string;
  source: string;
  matchedUrl: string;
  matchedName: string;
}

export interface CompetitorConfig {
  id: string;
  name: string;
  color: string;
  bgLight: string;
  baseUrl: string;
}
