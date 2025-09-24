import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ route, url, fetch }) => {

  let title = 'DLNA/SERVER GUI';
  // This is a workaround to fetch page data into layout data.
  // In a real app, you might use a more robust solution like a shared store or context.
  if (route.id) {
    console.log(`Loading page module for route: ${route.id}`);

    const codePath = `./${route.id.substring(1)}/+page.ts`;

    console.log(`Importing page module from: ${codePath}`);

    const pageModule = await import(codePath).catch(() => null);

    if (pageModule && pageModule.load) {
      const pageData = await pageModule.load({ fetch, params: url.searchParams, url });
      title = pageData.title;

    }
  }

  return {
    pathname: url.pathname,
    title: title
  };
}