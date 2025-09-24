/** @type {import('./$types').PageLoad} */
export function load({ params }) {
  return {
    title: `Remote: ${params.udn}`
  };
}