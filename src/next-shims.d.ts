declare module "next/link" {
  import type { AnchorHTMLAttributes, ReactNode } from "react";

  export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }): JSX.Element;
}

declare module "next/server" {
  export class NextRequest extends Request {}

  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
}

declare module "next/navigation" {
  export function redirect(url: string): never;
}

declare module "next/navigation.js" {
  export * from "next/navigation";
}

declare module "next/server.js" {
  export * from "next/server";
}

declare module "next/link.js" {
  export { default } from "next/link";
}

declare module "next/types.js" {
  export type MetadataRoute = unknown;
  export type ResolvingMetadata = Promise<Record<string, unknown>>;
  export type ResolvingViewport = Promise<Record<string, unknown>>;
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type Metadata = Record<string, unknown>;
  export type ResolvingMetadata = Promise<Record<string, unknown>>;
  export type ResolvingViewport = Promise<Record<string, unknown>>;
}
