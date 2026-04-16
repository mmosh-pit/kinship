// This type represents the overall response structure
export interface AssetsHeliusResponse {
  jsonrpc: string;
  result: ApiResult;
}

// This type represents the "result" property of the response
interface ApiResult {
  total: number;
  limit: number;
  page: number;
  nativeBalance: {
    lamports: number;
    price_per_sol: number;
    total_price: number;
  };
  items: ApiItem[];
}

// This type is a union type representing the different item types ("FungibleToken" or "V1_NFT")
type ApiItem = FungibleToken | V1NFT;

// This type represents a "FungibleToken" item
interface FungibleToken {
  interface: "FungibleToken";
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: File[];
    metadata: {
      name: string;
      symbol: string;
      token_standard: "Fungible";
    };
    links: {
      image: string;
    };
  };
  authorities: Authority[];
  compression: Compression;
  grouping: Grouping[];
  royalty: Royalty;
  creators: Creator[];
  ownership: Ownership;
  supply: null | { [key: string]: number };
  mutable: boolean;
  burnt: boolean;
  token_info: TokenInfo;
  group_definition: GroupDefinition[];
}

// This type represents a "V1_NFT" item
interface V1NFT {
  interface: "V1_NFT";
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: File[];
    metadata: {
      attributes: Attribute[];
      description: string;
      name: string;
      symbol: string;
      token_standard: "NonFungible";
    };
    links: { image?: string };
  };
  authorities: Authority[];
  compression: Compression;
  grouping: Grouping[];
  royalty: Royalty;
  creators: Creator[];
  ownership: Ownership;
  supply: {
    print_max_supply: number;
    print_current_supply: number;
    edition_nonce: number;
  };
  mutable: boolean;
  burnt: boolean;
  token_info: TokenInfo;
  group_definition?: GroupDefinition;
}

// This type represents a file within the content
interface File {
  uri: string;
  cdn_uri?: string;
  mime: string;
}

// This type represents an authority record
interface Authority {
  address: string;
  scopes: string[];
}

// This type represents the compression details
interface Compression {
  eligible: boolean;
  compressed: boolean;
  data_hash: string;
  creator_hash: string;
  asset_hash: string;
  tree: string;
  seq: number;
  leaf_id: number;
}

// This type represents a grouping record
interface Grouping {
  group_key: string;
  group_value: string;
  verified: boolean;
  collection_metadata?: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    external_url: string;
  };
}

// This type represents the royalty details
interface Royalty {
  royalty_model: string;
  target: null;
  percent: number;
  basis_points: number;
  primary_sale_happened: boolean;
  locked: boolean;
}

// This type represents a creator record
interface Creator {
  address: string;
  share?: number; // Optional for FungibleToken
  verified: boolean;
}

// This type represents the ownership details
interface Ownership {
  frozen: boolean;
  delegated: boolean;
  delegate: null;
  ownership_model: string;
  owner: string;
}

// This type represents the token information
interface TokenInfo {
  balance: number;
  supply: number;
  decimals: number;
  token_program: string;
  associated_token_address: string;
  mint_authority: string;
  freeze_authority: string;
}

// This type represents the group definition (optional for V1_NFT)
interface GroupDefinition {
  group_key: string;
  group_value: string;
  size: number;
}

// This type represents an attribute within the metadata of V1_NFT
interface Attribute {
  value: string;
  trait_type: string;
}
