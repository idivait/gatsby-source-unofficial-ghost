import GhostContentAPI from '@tryghost/content-api';
import type { GhostAPI, GhostContentAPIOptions, Params} from "@tryghost/content-api";
import type { Reporter } from "gatsby";

// TODO: Refactor to class. Test.

export const configure = ({url, key, version}: GhostContentAPIOptions) => {
    return new GhostContentAPI({url,key,version});
};

interface PaginateOptions {
	options: Params,
	reporter: Reporter
}
const paginate = async (submodule: GhostAPI["posts"], {options, reporter}: PaginateOptions)=>{
	if(reporter) reporter.info(`Fetching from Ghost API...`);
	let pagination, objects;

	try {
		// Get first page
		objects = await submodule.browse(options);
		pagination = objects.meta.pagination;
		if(reporter) reporter.info(JSON.stringify(pagination));
		if(!pagination.next) return objects;

		// Cycle through all pages
		while (pagination && pagination.next) {
			const more = await submodule.browse({...options, page: pagination.next });
			objects = [...objects, ...more]
			pagination = more.meta.pagination;
			if(reporter) reporter.info(JSON.stringify(pagination));
		}
		if (reporter) reporter.info(`Fetched ${objects.length} objects from Ghost API.`)
		return objects

	} catch (e) {
		if((typeof e === "string" || e instanceof Error) && reporter) reporter.error(e);
		throw e;
	}

}

export const posts = async (api: GhostAPI, options: Params, reporter: Reporter)=>{
	if (reporter) reporter.info("Sending posts to pagination.")
	const posts = await paginate(api.posts, {options, reporter})
    return posts
}

export const pages = async (api: GhostAPI, options: Params, reporter: Reporter)=>{
	if (reporter) reporter.info("Sending pages to pagination.")
	const pages = await paginate(api.pages, {options, reporter})
    return pages
}

console.log("test");

export default { configure, posts, pages }
