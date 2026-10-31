/****
 * gatsby-node.js
 *
 * Generate Gatsby nodes based on a custom schema derived from the Ghost V3 API spec.
 *
 * This source plugin will source and generate Posts, Pages, Tags, Authors and Settings.
 *
 * https://ghost.org/docs/api/v3/
 */
import * as ContentAPI from './gatsby-content-api.js';
import * as gatsbyNodeHelpers from 'gatsby-node-helpers';
import _ from 'lodash';
import * as cheerio from 'cheerio';
const {createNodeHelpers} = gatsbyNodeHelpers;

console.log(gatsbyNodeHelpers);
/**
 * Import all custom ghost types.
 */
import ghostTypes from './gatsby-ghost-schema.js';
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

    const PostNode = createNodeFactory(POST);
    const PageNode = createNodeFactory(PAGE);
    const TagNode = createNodeFactory(TAG);
    const AuthorNode = createNodeFactory(AUTHOR);
    const SettingsNode = createNodeFactory(SETTINGS);

    if (version.match(/^v\d$/)) {
        version = version.replace(/^(v\d)$/, '$1.0');
    }
    const api = ContentAPI.configure({ url: apiUrl, key: contentApiKey, version }, reporter);
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
        let posts = await ContentAPI.posts({api, options: postAndPageFetchOptions, reporter});
        posts = transformCodeinjection(posts);
        posts.forEach((post) => {
            post.primary_author = {
                id: post.primary_author.id,
                slug: post.primary_author.slug
            };
            createNode(PostNode(post));
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
        pages.forEach(page => createNode(PageNode(page)));
        reporter.info(`Fetched ${pages.length} pages from Ghost.`);
    } catch (e) {
        ignoreNotFoundElseRethrow(e);
    }
    const tagAndAuthorFetchOptions = {
        limit: 'all',
        include: 'count.posts'
    };

    // tags
    try {
        const tags = await ContentAPI.tags({api, options: tagAndAuthorFetchOptions, reporter});
        // Append post count
        tags.forEach(tag => { createNode( TagNode( {...tag, ...{ postCount: tag.count.posts }} ) ) });
        reporter.info(`Fetched ${tags.length} tags from Ghost.`);
    }
    catch (e) {
        ignoreNotFoundElseRethrow(e);
    }

    // authors
    try {
        const authors = await ContentAPI.authors({api, options: tagAndAuthorFetchOptions, reporter});
        authors.forEach(author => { createNode(AuthorNode( {...author, ...{postCount: author.count.posts}} )); });
        reporter.info(`Fetched ${authors.length} authors from Ghost.`);
    } catch (e) { ignoreNotFoundElseRethrow(e) }

    // settings
    try {
        const setting = await ContentAPI.settings({api, reporter});
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

        let newSetting = {};
        if (allCodeinjections) {
            const parsedCodeinjections = parseCodeinjection(allCodeinjections);
            if (_.isEmpty(setting.codeinjection_styles)) {
                newSetting.codeinjection_styles = parsedCodeinjections.styles;
            }
            else {
                newSetting.codeinjection_styles += parsedCodeinjections.styles;
            }
        }
        /**
         * Ensure always non-null by setting `codeinjection_styles` to
         * an empty string instead of null.
         */
        newSetting.codeinjection_styles = _.isNil(setting.codeinjection_styles)
            ? ''
            : setting.codeinjection_styles;
        // The settings object doesn't have an id, prevent Gatsby from getting 'undefined'
        newSetting.id = 1;
        createNode(SettingsNode({...setting, ...newSetting}));
    } catch (e) { ignoreNotFoundElseRethrow(e) }
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
