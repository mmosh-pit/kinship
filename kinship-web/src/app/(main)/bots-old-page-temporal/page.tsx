"use client";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bars } from "react-loader-spinner";
import ProjectCard from "../components/Project/ProjectCard";
import internalClient from "@/app/(main)/lib/internalHttpClient";
let source: any;

const Bots = () => {
  const navigate = useRouter();
  const [projectLoading, setProjectLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    getProjectsFromAPI("");
  }, []);

  const searchProject = (searchKeyword: any) => {
    setKeyword(searchKeyword);
    getProjectsFromAPI(searchKeyword);
  };

  const getProjectsFromAPI = async (keyword: any) => {
    try {
      if (source) {
        source.cancel();
        source = null;
      }
      source = axios.CancelToken.source();
      setProjectLoading(true);
      let url = "/api/project/list?type=directory";
      if (keyword.length > 0) {
        url = url + "&&searchText=" + keyword;
      }
      const listResult = await internalClient.get(url, {
        cancelToken: source.token,
      });
      setProjects(listResult.data);
      setProjectLoading(false);
    } catch (error) {
      setProjectLoading(false);
      setProjects([]);
    }
  };

  const onProjectSelect = (projectItem: any) => {
    navigate.push(`/bots/${projectItem.data.symbol.toLowerCase()}`);
  };

  return (
    <div className="relative background-content">
      <div className="flex flex-col items-center justify-center w-full py-12">
        <div className="flex px-4 bg-[#FFFFFF08] rounded-xl md:w-[60%] w-[90%] md:px-16 px-4 mt-10">
          <div className="self-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="white"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search bots or type the designated code to view a Secret bot"
            className="input bg-transparent px-2.5 h-14 border-0 focus:outline-0 text-xs w-full"
            onChange={(event) => searchProject(event.target.value)}
          />
        </div>
      </div>
      <div className="w-full flex justify-center md:px-16 px-4 self-center">
        {projects.length > 0 && !projectLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((projectItem: any) => (
              <ProjectCard
                data={projectItem}
                onClick={() => {
                  onProjectSelect(projectItem);
                }}
                showTimer={true}
              />
            ))}
          </div>
        )}
        {projectLoading && (
          <div className="mx-auto w-20">
            <Bars
              height="80"
              width="80"
              color="rgba(255, 0, 199, 1)"
              ariaLabel="bars-loading"
              wrapperStyle={{}}
              wrapperClass="bars-loading"
              visible={projectLoading}
            />
          </div>
        )}

        {projects.length == 0 && !projectLoading && (
          <div className="text-center text-xs">Projects not available</div>
        )}
      </div>
    </div>
  );
};

export default Bots;
