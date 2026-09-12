import Head from "next/head";
import { WebShell } from "../components/shell/web-shell";

export default function IndexPage() {
  return (
    <>
      <Head>
        <title>OneShot</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
      </Head>
      <WebShell />
    </>
  );
}
