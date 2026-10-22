import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function syncReviewCourses(root=fileURLToPath(new URL('../',import.meta.url))){
  const courses=JSON.parse(await readFile(resolve(root,'data/courses.json'),'utf8'));
  await mkdir(resolve(root,'upload-service/data'),{recursive:true});
  await writeFile(resolve(root,'upload-service/data/course-index.json'),`${JSON.stringify(courses.map(({id,name,code})=>({id,name,code})))}\n`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await syncReviewCourses();
