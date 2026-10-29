import GhostContentAPI from '@tryghost/content-api';
// TODO: Refactor to class. Test.
export const configure = ({ url, key, version }) => {
    return new GhostContentAPI({ url, key, version });
};
const paginate = async (submodule, { options, reporter }) => {
    if (reporter)
        reporter.info(`Fetching from Ghost API...`);
    let pagination, objects;
    try {
        // Get first page
        objects = await submodule.browse(options);
        pagination = objects.meta.pagination;
        if (reporter)
            reporter.info(JSON.stringify(pagination));
        if (!pagination.next)
            return objects;
        // Cycle through all pages
        while (pagination && pagination.next) {
            const more = await submodule.browse({ ...options, page: pagination.next });
            objects = [...objects, ...more];
            pagination = more.meta.pagination;
            if (reporter)
                reporter.info(JSON.stringify(pagination));
        }
        if (reporter)
            reporter.info(`Fetched ${objects.length} objects from Ghost API.`);
        return objects;
    }
    catch (e) {
        if ((typeof e === "string" || e instanceof Error) && reporter)
            reporter.error(e);
        throw e;
    }
};
export const posts = async (api, options, reporter) => {
    if (reporter)
        reporter.info("Sending posts to pagination.");
    const posts = await paginate(api.posts, { options, reporter });
    return posts;
};
export const pages = async (api, options, reporter) => {
    if (reporter)
        reporter.info("Sending pages to pagination.");
    const pages = await paginate(api.pages, { options, reporter });
    return pages;
};
console.log("test");
export default { configure, posts, pages };
