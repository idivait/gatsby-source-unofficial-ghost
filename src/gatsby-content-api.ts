import GhostContentAPI from '@tryghost/content-api';
import type { GhostAPI, GhostContentAPIOptions, Params} from "@tryghost/content-api";
import type { Reporter } from "gatsby";

// TODO: Refactor to class.

export const configure = ({url, key, version}: GhostContentAPIOptions, reporter: Reporter) => {
    reporter.info(`Configuring api: ${url} ${key} ${version}`)
	return new GhostContentAPI({url,key,version});
};

interface PaginateOptions {
	submodule: GhostAPI["posts"] | GhostAPI["authors"],
	options: Params,
	reporter: Reporter
}
interface SubmoduleParams {
	api: GhostAPI,
	options: Params,
	reporter: Reporter
}
const paginate = async ({submodule, options, reporter}: PaginateOptions)=>{
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
			const more: Awaited<ReturnType<typeof submodule.browse>> = await submodule.browse({...options, ...{page: pagination.next} });
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

export const posts = async ({api, options, reporter}: SubmoduleParams)=>{
	if (reporter) reporter.info("Sending posts to pagination.")
	const posts = await paginate({submodule: api.posts, options, reporter})
    return posts
}

export const pages = async ({api, options, reporter}: SubmoduleParams)=>{
	if (reporter) reporter.info("Sending pages to pagination.")
	const pages = await paginate({submodule: api.pages, options, reporter})
    return pages
}

export const tags = async ({api, options, reporter}: SubmoduleParams)=> {
	if (reporter) reporter.info ("Sending tags to pagination.")
	const tags = await paginate({submodule: api.tags, options, reporter})
    return tags
}

export const authors = async ({api, options, reporter}: SubmoduleParams)=> {
	if (reporter) reporter.info ("Sending authors to pagination.")
	const authors = await paginate({submodule: api.authors, options, reporter})
	return authors
}

export const settings = async ({api, reporter}: SubmoduleParams)=> {
	if (reporter) reporter.info("Fetching settings.");
	reporter.info(`${JSON.stringify(api)}`)
	const settings = await api.settings.browse()
	return settings
}

export default configure
