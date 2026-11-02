import { PREFIX } from "./constants.js";
export function nodeBuilder({ gatsbyApi, input }) {
    const id = gatsbyApi.createNodeId(`${PREFIX}${input.type}-${input.data.id}`);
    const node = {
        ...input.data,
        id,
        _id: input.data.id,
        parent: null,
        children: [],
        internal: {
            type: `${PREFIX}${input.type}`,
            contentDigest: gatsbyApi.createContentDigest(input.data),
        },
    };
    gatsbyApi.actions.createNode(node);
}
