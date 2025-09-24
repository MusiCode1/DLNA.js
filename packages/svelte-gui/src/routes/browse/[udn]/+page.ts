import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
    console.log("Browsing UDN:", params);
    
    return {
        title: `Browsing: ${params.udn}`
    };
}