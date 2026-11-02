/****
 * gatsby-node.js
 *
 * Generate Gatsby nodes based on a custom schema derived from the Ghost V3 API spec.
 *
 * This source plugin will source and generate Posts, Pages, Tags, Authors and Settings.
 *
 * https://ghost.org/docs/api/v3/
 */
import * as ContentAPI from './gatsby-content-api.ts';
import _ from 'lodash';
import * as cheerio from 'cheerio';
import { nodeBuilder } from './source-nodes.ts';

/**
 * Import all custom ghost types.
 */
import ghostTypes from './schema.ts';
import type { NodeBuilderInput } from "./types.ts"
import type { GatsbyNode, PluginCallback, PluginOptions, SourceNodesArgs } from 'gatsby';
import type { Params, IncludeParam, FormatParam, PostsOrPages, PostOrPage } from '@tryghost/content-api';
/**
 * Extract specific tags from html and return them in a new object.
 *
 * Only style tags are extracted at present.
 */
const parseCodeinjection = (html : string) => {
    let $ = null;
    /**
     * Attempt to load the HTML into cheerio. Do not escape the HTML. Load the HTML with htmlparser2 to allow for not decoding entities.
     */
    try {
        $ = cheerio.load(html, {
            xml: {
                xmlMode: false, // Enable htmlparser2's XML mode.
                decodeEntities: false, // Decode HTML entities.
                withStartIndices: false, // Add a `startIndex` property to nodes.
                withEndIndices: false // Add an `endIndex` property to nodes.
            }
        });
    }
    catch {
        return {};
    }
    /**
     * Extract all style tags from the markup.
     */
    const $parsedStyles = $(`style`);
    interface CodeInjObj {
        styles?: string
    }
    const codeInjObj : CodeInjObj = {};
    /**
     * For each extracted tag, add or append the tag's HTML to the new object.
     */
    $parsedStyles.each((i, style) => {
        if (i === 0) {
            codeInjObj.styles = $(style).html() || "";
        }
        else {
            codeInjObj.styles += $(style).html() || "";
        }
    });
    return codeInjObj;
};
/**
 * Extracts specific tags from the code injection header and footer and
 * transforms posts to include extracted tags as a new key and value in the post object.
 *
 * Only the `codeinjection_styles` key is added at present.
 */
type ExtraPostOrPage = PostOrPage & {
    codeinjection_styles?: string
}
const transformCodeinjection = (posts: PostsOrPages) => {
    posts.map((post: ExtraPostOrPage) => {
        const allCodeinjections = [
            post.codeinjection_head,
            post.codeinjection_foot
        ].join('');
        if (!allCodeinjections) {
            return post;
        }
        const headInjection = parseCodeinjection(allCodeinjections);
        if (_.isEmpty(post.codeinjection_styles)) {
            post.codeinjection_styles = headInjection.styles;
        }
        else {
            post.codeinjection_styles += headInjection.styles || '';
        }
        return post;
    });
    return posts;
};
/**
 * Create Live Ghost Nodes
 * Uses the Ghost Content API to fetch all posts, pages, tags, authors and settings
 * Creates nodes for each record, so that they are all available to Gatsby
 */

type ConfigOptions = PluginOptions & {
    apiUrl: string
    contentApiKey: string
    version: string
    postAndPageFetchCustomOptions?: Params
    plugins: unknown[]
}

// eslint-disable-next-line no-unused-vars
type contentApiSourceNode = ((args: SourceNodesArgs, options: ConfigOptions, callback: PluginCallback<void>) => void | Promise<void>)

export const sourceNodes: contentApiSourceNode = async (gatsbyApi, configOptions) => {
    const { reporter } = gatsbyApi;

    reporter.info(`Starting to fetch data from Ghost API...`);

    const { apiUrl, contentApiKey, postAndPageFetchCustomOptions = {} } = configOptions;
    let { version = `v5.0` }  = configOptions;

    if (version.match(/^v\d$/)) {
        version = version.replace(/^(v\d)$/, '$1.0');
    }
    const api = ContentAPI.configure({ url: apiUrl, key: contentApiKey, version }, reporter);

    let testapi;
    if (process.env.GHOST_CONTENT_API_KEY) {
        testapi = ContentAPI.configure({ url: apiUrl, key: process.env.GHOST_CONTENT_API_KEY, version }, reporter);
    }

    type APIError = {
        response?: {
            status?: number
        }
    } | unknown;
    const ignoreNotFoundElseRethrow = (err: APIError) => {

        if(typeof err === 'object' && err && "response" in err && err.response) {
            const response = err.response;
            if (typeof response === 'object' && response !== null && "status" in response && response.status === 404) {
                reporter.info(`Error type: ${typeof err}`);
                reporter.error(JSON.stringify(err));
                throw new Error(`Error fetching data from Ghost API. Please check your configuration and try again.`);
            }
        }
    };
    const postAndPageFetchOptions : Params = {
        limit: 'all',
        include: 'tags,authors'.split(',') as IncludeParam[],
        formats: 'html,plaintext'.split(',') as FormatParam[],
        ...postAndPageFetchCustomOptions
    };
    // posts
    try {

        const testPosts = await api.posts.browse({ limit: 1 });
        reporter.info(`testPosts? ${JSON.stringify(testPosts)}`);
        if (!testPosts || testPosts.length === 0) {
            reporter.info(`No posts found in Ghost API. Please check your configuration and try again.`);
            return;
        }

        if (testapi) {
            const testEng = await testapi.posts.browse({ limit: 1 });
            reporter.info(`testEng? ${JSON.stringify(testEng)}`);
            if (!testEng || testEng.length === 0) {
                reporter.info(`No posts found in Ghost API with the provided GHOST_CONTENT_API_KEY. Please check your configuration and try again.`);
                return;
            }
        }

        let posts = await ContentAPI.posts({api, options: postAndPageFetchOptions, reporter});
        posts = transformCodeinjection(posts);
        posts.forEach((post) => {
            if(!post.primary_author && post.authors && post.authors.length > 0) {
                post.primary_author = post.authors[0];
            }
            const nodeBuilderInput : NodeBuilderInput = { type: "Post", data: post };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${posts.length} posts from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    
    // pages
    try {
        reporter.info(`pages?`)
        const pages = await ContentAPI.pages({api, options: postAndPageFetchOptions, reporter});
        pages.forEach(page => {
            const nodeBuilderInput : NodeBuilderInput = { type: "Page", data: page };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${pages.length} pages from Ghost.`);
    } catch (e) {
        ignoreNotFoundElseRethrow(e);
    }

    // tags
    const tagAndAuthorFetchOptions : Params= {
        limit: 'all',
        include: 'count.posts'
    };

    
    try {
        const tags = await ContentAPI.tags({api, options: tagAndAuthorFetchOptions, reporter});
        // Append post count
        tags.forEach(tag => { 
            const nodeBuilderInput : NodeBuilderInput = { type: "Tag", data: {...tag, ...{ postCount: tag?.count?.posts || 0 }} };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${tags.length} tags from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }

    // authors
    try {
        const authors = await ContentAPI.authors({api, options: tagAndAuthorFetchOptions, reporter});
        authors.forEach(author => { 
            const nodeBuilderInput : NodeBuilderInput = { type: "Author", data: {...author, ...{postCount: author?.count?.posts || 0 }} };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${authors.length} authors from Ghost.`);
    } catch (e) { ignoreNotFoundElseRethrow(e) }

    // settings
    try {
        const setting = await ContentAPI.settings({api, reporter});
        /**
         * Assert the presence of any code injections, from both the use and ghost.
         */
        const codeinjectionHead = setting.codeinjection_head || setting.ghost_head || ``;
        const codeinjectionFoot = setting.codeinjection_foot || setting.ghost_foot || ``;
        const allCodeinjections = codeinjectionHead
            ? codeinjectionHead.concat(codeinjectionFoot)
            : codeinjectionFoot
                ? codeinjectionFoot
                : null;
        /**
         * If there are any code injections, extract style tags from the markup and
         * transform the setting object to include the `codeinjection_styles` key with the value of those style tags.
         */

        interface AdditionalSettings {
            codeinjection_styles: string,
            id: number
        }
        const newSetting : AdditionalSettings = { 
            id : 1,
            codeinjection_styles: ''
        };

        if (allCodeinjections) {
            const parsedCodeinjections = parseCodeinjection(allCodeinjections);
            newSetting.codeinjection_styles += parsedCodeinjections.styles || '';
        }
        
        const nodeBuilderInput : NodeBuilderInput = { type: "Settings", data: {...setting, ...newSetting} };
        nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
    } catch (e) { ignoreNotFoundElseRethrow(e) }
};
/**
 * Creates custom types based on the Ghost V3 API.
 *
 * This creates a fully custom schema, removing the need for dummy content or fake nodes.
 */
export const createSchemaCustomization: GatsbyNode['createSchemaCustomization'] = ({ actions }) => {
    const { createTypes } = actions;
    createTypes(ghostTypes);
};
