"use client";
import ProjectCard from "../../components/Project/ProjectCard";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bars } from "react-loader-spinner";
let source: any;
const LaunchPad = () => {
  const navigate = useRouter();
  const [projectLoading, setProjectLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [projects, setProjects] = useState<any>([]);
  const [latest, setLatest] = useState<any>(null);
  const [countDownDate, setCountDownDate] = useState(0);
  const [countDown, setCountDown] = useState(0);

  useEffect(() => {
    getProjectsFromAPI("");
  }, []);

  useEffect(() => {
    if (latest) {
      let dexListDate = convertUTCDateToLocalDate(
        new Date(latest.dexlistingdate),
      );
      let dexdiff = new Date().getTime() - dexListDate.getTime();
      if (dexdiff < 0) {
        setCountDownDate(dexListDate.getTime());
      }
    }
  }, [latest]);

  const convertUTCDateToLocalDate = (date: any) => {
    var newDate = new Date(
      date.getTime() + date.getTimezoneOffset() * 60 * 1000,
    );
    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();
    newDate.setHours(hours - offset);
    return newDate;
  };

  useEffect(() => {
    if (countDownDate == 0) {
      return;
    }
    const interval = setInterval(() => {
      setCountDown(countDownDate - new Date().getTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [countDownDate]);

  const getCountDownValues = (countDown: any) => {
    // calculate time left
    const days = Math.floor(countDown / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (countDown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((countDown % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((countDown % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  };

  const minTwoDigits = (n: number) => {
    return (n < 10 ? "0" : "") + n;
  };

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
      let url = "/api/project/list?type=launchpad";
      if (keyword.length > 0) {
        url = url + "&&searchText=" + keyword;
      }
      const listResult = await internalClient.get(url, {
        cancelToken: source.token,
      });

      let newLatest = null;
      let newProjects = [];
      for (let index = 0; index < listResult.data.length; index++) {
        if (index === 0) {
          newLatest = listResult.data[index];
        } else {
          newProjects.push(listResult.data[index]);
        }
      }
      setProjects(newProjects);
      setLatest(newLatest);
      setProjectLoading(false);
    } catch (error) {
      setProjectLoading(false);
      setProjects([]);
    }
  };

  const onProjectSelect = (projectItem: any) => {
    navigate.push("/create/project/" + projectItem.key);
  };

  return (
    <div className="relative background-content">
      <div className="flex flex-col items-center justify-center w-full py-12">
        <div className="relative w-full flex flex-col justify-center items-center">
          <h2 className="text-center text-white font-goudy font-normal text-xl">
            Launchpad
          </h2>
        </div>
      </div>
      {latest && !projectLoading && (
        <div className="md:flex justify-center mx-10 md:mx-0 mb-5">
          <div className="search-container md:flex p-10">
            <div className="pr-10 flex flex-col justify-center">
              <h2 className="text-white font-goudy font-normal text-xl mb-8 text-center">
                Countdown to Launch
              </h2>
              <div className="flex justify-center mb-8">
                <div>
                  <div className="w-16 h-16 font-goudy text-xl text-center text-white rounded-md border border-white border-opacity-20 flex justify-center align-center items-center">
                    {minTwoDigits(getCountDownValues(countDown).days)}
                  </div>
                  <p className="text-header-small-font-size text-center">
                    days
                  </p>
                </div>
                <div className="flex flex-col h-16 justify-center align-center">
                  <img src="/time.png" alt="time" className="w-[6px] mx-1.5" />
                </div>
                <div>
                  <div className="w-16 h-16 font-goudy text-xl text-center text-white rounded-md border border-white border-opacity-20 flex justify-center align-center items-center">
                    {minTwoDigits(getCountDownValues(countDown).hours)}
                  </div>
                  <p className="text-header-small-font-size text-center">
                    Hours
                  </p>
                </div>
                <div className="flex flex-col h-16 justify-center align-center">
                  <img src="/time.png" alt="time" className="w-[6px] mx-1.5" />
                </div>
                <div>
                  <div className="w-16 h-16 font-goudy text-xl text-center text-white rounded-md border border-white border-opacity-20 flex justify-center align-center items-center">
                    {minTwoDigits(getCountDownValues(countDown).minutes)}
                  </div>
                  <p className="text-header-small-font-size text-center">
                    Minutes
                  </p>
                </div>
                <div className="flex flex-col h-16 justify-center align-center">
                  <img src="/time.png" alt="time" className="w-[6px] mx-1.5" />
                </div>
                <div>
                  <div className="w-16 h-16 font-goudy text-xl text-center text-white rounded-md border border-white border-opacity-20 flex justify-center align-center items-center">
                    {minTwoDigits(getCountDownValues(countDown).seconds)}
                  </div>
                  <p className="text-header-small-font-size text-center">
                    Seconds
                  </p>
                </div>
              </div>
            </div>
            {latest && !projectLoading && (
              <div className="w-[300px] pt-10 md:pt-0 mx-auto">
                <ProjectCard
                  data={latest}
                  onClick={() => {
                    onProjectSelect(latest);
                  }}
                  showTimer={false}
                />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="container mx-auto pb-12">
        <div className="pt-5 pb-12 border-t border-white border-opacity-20">
          <div className="relative w-full flex flex-col justify-center items-center">
            <div className="relative flex search-container">
              <button className="btn btn-circle bg-search h-10 w-10 min-h-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </button>
              <input
                type="text"
                placeholder="Type your search terms"
                className="input bg-transparent px-2.5 h-10 border-0 focus:outline-0 text-xs w-52"
                onChange={(event) => searchProject(event.target.value)}
              />
            </div>
          </div>
        </div>

        {projects.length > 0 && !projectLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {projects.map((projectItem: any, index: any) => (
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

        {projects.length == 0 && !projectLoading && !latest && (
          <div className="text-center text-xs">Projects not available</div>
        )}
      </div>
    </div>
  );
};

export default LaunchPad;
