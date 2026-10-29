import GhostContentAPI from '@tryghost/content-api';

export const configure = ({apiUrl, contentApiKey, version}) => {
    return new GhostContentAPI({
        url: apiUrl,
        key: contentApiKey,
        version
    });
};

const paginateAPI = async (submodule, {options, reporter})=>{
	if(reporter) reporter.info(`Fetching from Ghost API...`);
	let page;

	try {
		let allPosts = await submodule.browse(options);
		if(reporter) reporter.info(JSON.stringify(allPosts.meta.pagination));
		page = allPosts.meta.pagination.next;
		if(!page) return allPosts;

		let pages = allPosts.meta.pagination.pages;

		while (page < pages) {
			options.page = page;
			const morePosts = await submodule.browse(options);
			allPosts = allPosts.concat(morePosts)
			if(reporter) reporter.info(JSON.stringify(morePosts.meta.pagination));
			page = morePosts.meta.pagination.next;
		}
		reporter.info(`Fetched ${allPosts.length} objects from Ghost API.`)
		return allPosts
	} catch (e) {
		if(reporter) reporter.error(e);
	}

}

export const posts = async (api, options, reporter)=>{
	reporter.info("Sending posts to pagination.")
	const posts = await paginateAPI(api.posts, {options, reporter})
    return posts
}

export const pages = async (api, options,reporter)=>{
	let page;

	let limit = 15;

	let pageResponse = await api.pages
		.browse(options)
		.catch(() => {
			return [];
		});

	page = pageResponse.meta.pagination.next;
	if(!page) return pageResponse;

	let pages = pageResponse.meta.pagination.pages;

	while (page < pages) {

		const morePosts = await api.pages
			.browse({
				include: "tags,authors",
				page,
				limit,
			})
			.catch(() => {
				return [];
			});

		pageResponse = pageResponse.concat(morePosts)

		page = morePosts.meta.pagination.next;
	}

	reporter.info(`Pages length: ${pageResponse.length}`)

    return pageResponse

}

export default { configure, posts, pages }
