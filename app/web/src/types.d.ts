declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "next/app" {
  import type { NextComponentType, NextPageContext } from "next";
  export type AppProps = {
    Component: NextComponentType<NextPageContext, any, any>;
    pageProps: any;
  };
}
