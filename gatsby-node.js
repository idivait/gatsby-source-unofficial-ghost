/****
 * gatsby-node.js
 *
 * Generate Gatsby nodes based on a custom schema derived from the Ghost V3 API spec.
 *
 * This source plugin will source and generate Posts, Pages, Tags, Authors and Settings.
 *
 * https://ghost.org/docs/api/v3/
 */
import * as ContentAPI from "./gatsby-content-api.js";
import _ from 'lodash';
import * as cheerio from 'cheerio';
import { nodeBuilder } from "./source-nodes.js";
/**
 * Import all custom ghost types.
 */
import ghostTypes from "./schema.js";
/**
 * Extract specific tags from html and return them in a new object.
 *
 * Only style tags are extracted at present.
 */
const parseCodeinjection = (html) => {
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
    const codeInjObj = {};
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
const transformCodeinjection = (posts) => {
    posts.map((post) => {
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
export const sourceNodes = async (gatsbyApi, configOptions) => {
    const { reporter } = gatsbyApi;
    reporter.info(`Starting to fetch data from Ghost API...`);
    const { apiUrl, contentApiKey, postAndPageFetchCustomOptions = {} } = configOptions;
    let { version = `v5.0` } = configOptions;
    if (version.match(/^v\d$/)) {
        version = version.replace(/^(v\d)$/, '$1.0');
    }
    const api = ContentAPI.configure({ url: apiUrl, key: contentApiKey, version }, reporter);
    let testapi;
    if (process.env.GHOST_CONTENT_API_KEY) {
        testapi = ContentAPI.configure({ url: apiUrl, key: process.env.GHOST_CONTENT_API_KEY, version }, reporter);
    }
    const ignoreNotFoundElseRethrow = (err) => {
        if (typeof err === 'object' && err && "response" in err && err.response) {
            const response = err.response;
            if (typeof response === 'object' && response !== null && "status" in response && response.status === 404) {
                reporter.info(`Error type: ${typeof err}`);
                reporter.error(JSON.stringify(err));
                throw new Error(`Error fetching data from Ghost API. Please check your configuration and try again.`);
            }
        }
    };
    const postAndPageFetchOptions = {
        limit: 'all',
        include: 'tags,authors'.split(','),
        formats: 'html,plaintext'.split(','),
        ...postAndPageFetchCustomOptions
    };
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
    // posts
    try {
        let posts = await ContentAPI.posts({ api, options: postAndPageFetchOptions, reporter });
        posts = transformCodeinjection(posts);
        posts.forEach((post) => {
            if (!post.primary_author && post.authors && post.authors.length > 0) {
                post.primary_author = post.authors[0];
            }
            const nodeBuilderInput = { type: "Post", data: post };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${posts.length} posts from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    // pages
    try {
        reporter.info(`pages?`);
        const pages = await ContentAPI.pages({ api, options: postAndPageFetchOptions, reporter });
        pages.forEach(page => {
            const nodeBuilderInput = { type: "Page", data: page };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${pages.length} pages from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    // tags
    const tagAndAuthorFetchOptions = {
        limit: 'all',
        include: 'count.posts'
    };
    try {
        const tags = await ContentAPI.tags({ api, options: tagAndAuthorFetchOptions, reporter });
        // Append post count
        tags.forEach(tag => {
            const nodeBuilderInput = { type: "Tag", data: { ...tag, ...{ postCount: tag?.count?.posts || 0 } } };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${tags.length} tags from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    // authors
    try {
        const authors = await ContentAPI.authors({ api, options: tagAndAuthorFetchOptions, reporter });
        authors.forEach(author => {
            const nodeBuilderInput = { type: "Author", data: { ...author, ...{ postCount: author?.count?.posts || 0 } } };
            nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
        });
        reporter.info(`Fetched ${authors.length} authors from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    // settings
    try {
        const setting = await ContentAPI.settings({ api, reporter });
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
        const newSetting = {
            id: 1,
            codeinjection_styles: ''
        };
        if (allCodeinjections) {
            const parsedCodeinjections = parseCodeinjection(allCodeinjections);
            newSetting.codeinjection_styles += parsedCodeinjections.styles || '';
        }
        const nodeBuilderInput = { type: "Settings", data: { ...setting, ...newSetting } };
        nodeBuilder({ gatsbyApi, input: nodeBuilderInput });
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
};
/**
 * Creates custom types based on the Ghost V3 API.
 *
 * This creates a fully custom schema, removing the need for dummy content or fake nodes.
 */
export const createSchemaCustomization = ({ actions }) => {
    const { createTypes } = actions;
    createTypes(ghostTypes);
};
