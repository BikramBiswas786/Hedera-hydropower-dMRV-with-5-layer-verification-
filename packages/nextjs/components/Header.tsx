"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AcademicCapIcon,
  Bars3Icon,
  BeakerIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  DocumentMagnifyingGlassIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-hbar";
import { useOutsideClick } from "~~/hooks/scaffold-hbar";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Start here",
    href: "/guide",
    icon: <BookOpenIcon className="h-4 w-4" />,
  },
  {
    label: "Methodology",
    href: "/methodology",
    icon: <AcademicCapIcon className="h-4 w-4" />,
  },
  {
    label: "Verify",
    href: "/verify",
    icon: <BeakerIcon className="h-4 w-4" />,
  },
  {
    label: "Plants",
    href: "/plants",
    icon: <BuildingOffice2Icon className="h-4 w-4" />,
  },
  {
    label: "Market",
    href: "/market",
    icon: <ShoppingBagIcon className="h-4 w-4" />,
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: <BriefcaseIcon className="h-4 w-4" />,
  },
  {
    label: "Audit",
    href: "/audit",
    icon: <DocumentMagnifyingGlassIcon className="h-4 w-4" />,
  },
];

/** The desktop bar skips "Home": the logo next to it links home, and the bar needs the room. */
export const HeaderMenuLinks = ({ withHome = true }: { withHome?: boolean }) => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks
        .filter(({ href }) => withHome || href !== "/")
        .map(({ label, href, icon }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                passHref
                className={`${
                  isActive ? "bg-primary/10 text-primary font-semibold" : "hover:bg-primary/5"
                } py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col transition-colors`}
              >
                {/* Beside a connected wallet the desktop bar only fits every link without icons below 2xl. */}
                {withHome ? icon : <span className="hidden 2xl:inline-flex">{icon}</span>}
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="print:hidden sticky xl:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-sm border-b border-base-300 px-0 sm:px-2">
      <div className="navbar-start w-auto xl:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost xl:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden xl:flex items-center gap-3 ml-4 mr-4 shrink-0">
          <div className="flex relative w-9 h-9">
            <Image alt="Hedera icon" className="cursor-pointer dark:hidden" fill src="/Hedera-Icon-Dark.svg" />
            <Image alt="Hedera icon" className="cursor-pointer hidden dark:block" fill src="/Hedera-Icon-White.svg" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight text-base">Hydro dMRV</span>
            <span className="text-[10px] tracking-wider uppercase text-base-content/50 font-medium">
              Built on Hedera
            </span>
          </div>
        </Link>
        <ul className="hidden xl:flex xl:flex-nowrap menu menu-horizontal px-1 gap-1">
          <HeaderMenuLinks withHome={false} />
        </ul>
      </div>
      <div className="navbar-end grow mr-4">
        <RainbowKitCustomConnectButton />
      </div>
    </div>
  );
};
