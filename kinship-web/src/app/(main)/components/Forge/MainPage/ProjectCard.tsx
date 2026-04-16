import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "../../common/Button";

const ProjectCard = () => {
  const navigate = useRouter();

  const navigateToCreateProject = () => {
    navigate.push("/create/create_projects");
  };

  const navigateToProjectsList = () => {
    navigate.push("/create/projects");
  };

  return (
    <div className="flex">
      <div className="relative w-[12vmax] h-[8vmax] ml-2 mr-4">
        <Image
          src="https://storage.googleapis.com/hellbenders-public-c095b-assets/hellbendersWebAssets/mmosh_box.jpeg"
          alt="Invitation"
          layout="fill"
        />
      </div>

      <div className="w-full flex flex-col justify-between">
        <div className="w-full flex flex-col mt-2 mb-4">
          <p className="text-lg text-white">Create a Project</p>
          <p className="text-sm mt-2">
            Launch your own Project and Community Coin!
          </p>
        </div>

        <div className="w-full flex justify-around">
          <Button
            isLoading={false}
            title="Project Directory"
            isPrimary={false}
            size="small"
            action={navigateToProjectsList}
          />

          <Button
            isLoading={false}
            title="Create a Project"
            isPrimary
            size="small"
            action={navigateToCreateProject}
          />
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
