import type { SourceNodesArgs, NodeInput } from "gatsby"
import type { NodeBuilderInput } from "./types.ts"

import { PREFIX } from "./constants.ts"

export function nodeBuilder({ gatsbyApi, input }: INodeBuilderArgs) {
  const id = gatsbyApi.createNodeId(`${PREFIX}${input.type}-${input.data.id}`)

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
  } satisfies NodeInput

  gatsbyApi.actions.createNode(node)
}

interface INodeBuilderArgs {
  gatsbyApi: SourceNodesArgs
  input: NodeBuilderInput
}