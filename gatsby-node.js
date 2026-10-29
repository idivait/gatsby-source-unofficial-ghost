/****
 * gatsby-node.js
 *
 * Generate Gatsby nodes based on a custom schema derived from the Ghost V3 API spec.
 *
 * This source plugin will source and generate Posts, Pages, Tags, Authors and Settings.
 *
 * https://ghost.org/docs/api/v3/
 */
import ContentAPI from './gatsby-content-api.js';
import { createNodeHelpers } from 'gatsby-node-helpers';
import _ from 'lodash';
import * as cheerio from 'cheerio/slim';
/**
 * Import all custom ghost types.
 */
import ghostTypes from './ghost-schema.js';
let fetchTiers = null;
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
            codeInjObj.styles = $(style).html();
        }
        else {
            codeInjObj.styles += $(style).html();
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
            post.codeinjection_styles += headInjection.styles;
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
export const sourceNodes = async ({ actions, reporter, createNodeId, createContentDigest }, configOptions) => {
    const { createNode } = actions;
    const { createNodeFactory } = createNodeHelpers({
        typePrefix: 'Ghost',
        createNodeId,
        createContentDigest,
    });
    let { apiUrl, contentApiKey, version = `v5.0`, postAndPageFetchCustomOptions = {} } = configOptions;
    // Node Types
    const POST = 'Post';
    const PAGE = 'Page';
    const TAG = 'Tag';
    const AUTHOR = 'Author';
    const SETTINGS = 'Settings';
    const TIERS = 'Tiers';
    const PostNode = createNodeFactory(POST);
    const PageNode = createNodeFactory(PAGE);
    const TagNode = createNodeFactory(TAG);
    const AuthorNode = createNodeFactory(AUTHOR);
    const SettingsNode = createNodeFactory(SETTINGS);
    const TiersNode = createNodeFactory(TIERS);
    if (version.match(/^v\d$/)) {
        version = version.replace(/^(v\d)$/, '$1.0');
    }
    const api = ContentAPI.configure({ url: apiUrl, key: contentApiKey, version });
    const ignoreNotFoundElseRethrow = (err) => {
        if (err && err.response && err.response.status !== 404) {
            throw err;
        }
    };
    const postAndPageFetchOptions = {
        limit: 'all',
        include: 'tags,authors',
        formats: 'html,plaintext',
        ...postAndPageFetchCustomOptions
    };
    // posts
    try {
        reporter.info("Sending in posts.");
        let posts = await ContentAPI.posts(api, postAndPageFetchOptions, reporter);
        posts = transformCodeinjection(posts);
        posts.forEach((post, i) => {
            post.primary_author = {
                id: post.primary_author.id,
                slug: post.primary_author.slug
            };
            createNode(PostNode(post));
        });
        reporter.info(`Fetched ${posts.length} posts from Ghost.`);
        reporter.info(PostNode(posts[0]));
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    // pages
    try {
        const pages = await ContentAPI.pages(api, postAndPageFetchOptions, reporter);
        pages.forEach(page => createNode(PageNode(page)));
        reporter.info(`Fetched ${pages.length} pages from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    const tagAndAuthorFetchOptions = {
        limit: 'all',
        include: 'count.posts'
    };
    // tags
    try {
        const tags = await ContentAPI.tags(api, tagAndAuthorFetchOptions);
        tags.forEach(tag => createNode(TagNode(tag)));
        reporter.info(`Fetched ${tags.length} tags from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    const fetchAuthors = api.authors(tagAndAuthorFetchOptions)
        .then((authors) => {
        authors.forEach((author) => {
            author.postCount = author.count.posts;
            createNode(AuthorNode(author));
        });
    }).catch(ignoreNotFoundElseRethrow);
    const fetchSettings = api.settings.then((setting) => {
        /**
         * Assert the presence of any code injections, from both the use and ghost.
         */
        const codeinjectionHead = setting.codeinjection_head || setting.ghost_head;
        const codeinjectionFoot = setting.codeinjection_foot || setting.ghost_foot;
        const allCodeinjections = codeinjectionHead
            ? codeinjectionHead.concat(codeinjectionFoot)
            : codeinjectionFoot
                ? codeinjectionFoot
                : null;
        /**
         * If there are any code injections, extract style tags from the markup and
         * transform the setting object to include the `codeinjection_styles` key with the value of those style tags.
         */
        if (allCodeinjections) {
            const parsedCodeinjections = parseCodeinjection(allCodeinjections);
            if (_.isEmpty(setting.codeinjection_styles)) {
                setting.codeinjection_styles = parsedCodeinjections.styles;
            }
            else {
                setting.codeinjection_styles += parsedCodeinjections.styles;
            }
        }
        /**
         * Ensure always non-null by setting `codeinjection_styles` to
         * an empty string instead of null.
         */
        setting.codeinjection_styles = _.isNil(setting.codeinjection_styles)
            ? ''
            : setting.codeinjection_styles;
        // The settings object doesn't have an id, prevent Gatsby from getting 'undefined'
        setting.id = 1;
        createNode(SettingsNode(setting));
    }).catch(ignoreNotFoundElseRethrow);
    if (version.match(/^v5\.\d/)) {
        api.tiers
            .browse({ include: 'benefits,monthly_price,yearly_price' })
            .then((tiers) => {
            tiers.forEach(tier => createNode(TiersNode(tier)));
        }).catch(ignoreNotFoundElseRethrow);
    }
    return [posts, pages, tags];
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
