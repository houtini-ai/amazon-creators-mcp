/**
 * Types for the Amazon Creators API response shapes we care about.
 * Derived from the live API (2026-04-16) — where docs and reality diverge,
 * reality wins. See SCOPE.md §3.6.
 */

export interface Money {
  amount: number;
  currency: string;
  displayAmount: string;
}

export interface PriceField {
  money: Money;
  savings?: { money?: Money; percentage?: number };
}

export interface Listing {
  isBuyBoxWinner?: boolean;
  price?: PriceField;
  availability?: { message?: string; type?: string };
  condition?: { value?: string; subCondition?: { value?: string } };
  dealDetails?: Record<string, unknown>;
  loyaltyPoints?: { points?: number };
  merchantInfo?: { defaultShippingCountry?: string; id?: string; name?: string };
  type?: string;
  violatesMAP?: boolean;
}

export interface ImageSize {
  url: string;
  height?: number;
  width?: number;
}

export interface ImageSet {
  small?: ImageSize;
  medium?: ImageSize;
  large?: ImageSize;
  highRes?: ImageSize;
}

export interface Images {
  primary?: ImageSet;
  variants?: ImageSize[] | { small?: ImageSize[]; medium?: ImageSize[]; large?: ImageSize[]; highRes?: ImageSize[] };
}

export interface SingleValueLocalised {
  displayValue?: string | boolean | number;
  label?: string;
  locale?: string;
}

export interface MultiValueLocalised {
  displayValues?: Array<string | boolean | number>;
  label?: string;
  locale?: string;
}

export interface ByLineInfo {
  brand?: SingleValueLocalised;
  manufacturer?: SingleValueLocalised;
  contributors?: Array<{ name?: string; role?: string; roleType?: string }>;
}

export interface ItemInfo {
  byLineInfo?: ByLineInfo;
  classifications?: {
    binding?: SingleValueLocalised;
    productGroup?: SingleValueLocalised;
  };
  contentInfo?: Record<string, SingleValueLocalised>;
  contentRating?: { ageRatingHighest?: SingleValueLocalised };
  externalIds?: {
    EANs?: MultiValueLocalised;
    ISBNs?: MultiValueLocalised;
    UPCs?: MultiValueLocalised;
    DEWEYs?: MultiValueLocalised;
  };
  features?: MultiValueLocalised;
  manufactureInfo?: {
    itemPartNumber?: SingleValueLocalised;
    model?: SingleValueLocalised;
    warranty?: SingleValueLocalised;
  };
  productInfo?: {
    color?: SingleValueLocalised;
    isAdultProduct?: SingleValueLocalised;
    itemDimensions?: Record<string, unknown>;
    releaseDate?: SingleValueLocalised;
    size?: SingleValueLocalised;
    unitCount?: SingleValueLocalised;
  };
  technicalInfo?: Record<string, SingleValueLocalised>;
  title?: SingleValueLocalised;
  tradeInInfo?: { isEligibleForTradeIn?: boolean; price?: PriceField };
}

export interface BrowseNodeAncestor {
  id?: string;
  displayName?: string;
  contextFreeName?: string;
  ancestor?: BrowseNodeAncestor;
}

export interface BrowseNode {
  id?: string;
  displayName?: string;
  contextFreeName?: string;
  isRoot?: boolean;
  ancestor?: BrowseNodeAncestor;
  salesRank?: number;
  children?: BrowseNode[];
}

export interface BrowseNodeInfo {
  browseNodes?: BrowseNode[];
  websiteSalesRank?: {
    contextFreeName?: string;
    displayName?: string;
    rank?: number;
  };
}

export interface CustomerReviews {
  count?: number;
  starRating?: { value?: number };
}

export interface Item {
  asin: string;
  detailPageURL?: string;
  parentASIN?: string;
  images?: Images;
  itemInfo?: ItemInfo;
  offersV2?: { listings?: Listing[] };
  browseNodeInfo?: BrowseNodeInfo;
  customerReviews?: CustomerReviews;
}

export interface ApiErrorEntry {
  code?: string;
  message?: string;
  /** Some endpoints include the key of the failed input (e.g. the ASIN). */
  asin?: string;
}

export interface SearchItemsResponse {
  searchResult?: {
    items?: Item[];
    searchURL?: string;
    totalResultCount?: number;
    searchRefinements?: Record<string, unknown>;
  };
  errors?: ApiErrorEntry[];
}

export interface GetItemsResponse {
  itemsResult?: { items?: Item[] };
  errors?: ApiErrorEntry[];
}

export interface GetVariationsResponse {
  variationsResult?: {
    items?: Item[];
    variationSummary?: Record<string, unknown>;
  };
  errors?: ApiErrorEntry[];
}

export interface GetBrowseNodesResponse {
  browseNodesResult?: { browseNodes?: BrowseNode[] };
  errors?: ApiErrorEntry[];
}
