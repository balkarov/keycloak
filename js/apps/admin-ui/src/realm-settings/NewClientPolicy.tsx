import type ClientPolicyRepresentation from "@keycloak/keycloak-admin-client/lib/defs/clientPolicyRepresentation";
import type ClientProfileRepresentation from "@keycloak/keycloak-admin-client/lib/defs/clientProfileRepresentation";
import {
  ActionGroup,
  AlertVariant,
  Button,
  ButtonVariant,
  DataList,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  Divider,
  Flex,
  FlexItem,
  FormGroup,
  PageSection,
  Text,
  TextVariants,
} from "@patternfly/react-core";
import { DropdownItem } from "@patternfly/react-core/deprecated";
import { PlusCircleIcon, TrashIcon } from "@patternfly/react-icons";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { HelpItem, KeycloakTextArea, TextControl } from "ui-shared";

import { adminClient } from "../admin-client";
import { useAlerts } from "../components/alert/Alerts";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { FormAccess } from "../components/form/FormAccess";
import { KeycloakSpinner } from "../components/keycloak-spinner/KeycloakSpinner";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { useRealm } from "../context/realm-context/RealmContext";
import { useServerInfo } from "../context/server-info/ServerInfoProvider";
import { useFetch } from "../utils/useFetch";
import { useParams } from "../utils/useParams";
import { AddClientProfileModal } from "./AddClientProfileModal";
import { toNewClientPolicyCondition } from "./routes/AddCondition";
import { toClientPolicies } from "./routes/ClientPolicies";
import { toClientProfile } from "./routes/ClientProfile";
import {
  EditClientPolicyParams,
  toEditClientPolicy,
} from "./routes/EditClientPolicy";
import { toEditClientPolicyCondition } from "./routes/EditCondition";

import "./realm-settings-section.css";

type FormFields = Required<ClientPolicyRepresentation>;

const defaultValues: FormFields = {
  name: "",
  description: "",
  conditions: [],
  enabled: true,
  profiles: [],
};

type PolicyDetailAttributes = {
  idx: number;
  name: string;
};

export default function NewClientPolicy() {
  const { t } = useTranslation();
  const { realm } = useRealm();
  const { addAlert, addError } = useAlerts();
  const [policies, setPolicies] = useState<ClientPolicyRepresentation[]>();
  const [clientProfiles, setClientProfiles] = useState<
    ClientProfileRepresentation[]
  >([]);

  const [currentPolicy, setCurrentPolicy] =
    useState<ClientPolicyRepresentation>();
  const [
    showAddConditionsAndProfilesForm,
    setShowAddConditionsAndProfilesForm,
  ] = useState(false);

  const [conditionToDelete, setConditionToDelete] =
    useState<PolicyDetailAttributes>();

  const [profilesModalOpen, setProfilesModalOpen] = useState(false);

  const [profileToDelete, setProfileToDelete] =
    useState<PolicyDetailAttributes>();

  const { policyName } = useParams<EditClientPolicyParams>();

  const navigate = useNavigate();
  const form = useForm<FormFields>({
    mode: "onChange",
    defaultValues,
  });
  const { handleSubmit } = form;

  const formValues = form.getValues();

  useFetch(
    async () => {
      const [policies, profiles] = await Promise.all([
        adminClient.clientPolicies.listPolicies(),
        adminClient.clientPolicies.listProfiles({
          includeGlobalProfiles: true,
        }),
      ]);

      return { policies, profiles };
    },
    ({ policies, profiles }) => {
      const currentPolicy = policies.policies?.find(
        (item) => item.name === policyName,
      );

      const allClientProfiles = [
        ...(profiles.globalProfiles ?? []),
        ...(profiles.profiles ?? []),
      ];

      setPolicies(policies.policies ?? []);
      if (currentPolicy) {
        setupForm(currentPolicy);
        setClientProfiles(allClientProfiles);
        setCurrentPolicy(currentPolicy);
        setShowAddConditionsAndProfilesForm(true);
      }
    },
    [],
  );

  const setupForm = (policy: ClientPolicyRepresentation) => {
    form.reset(policy);
  };

  const policy = (policies || []).filter(
    (policy) => policy.name === policyName,
  );
  const policyConditions = policy[0]?.conditions || [];
  const policyProfiles = policy[0]?.profiles || [];

  const serverInfo = useServerInfo();

  const conditionTypes =
    serverInfo.componentTypes?.[
      "org.keycloak.services.clientpolicy.condition.ClientPolicyConditionProvider"
    ];

  const save = async () => {
    const createdForm = form.getValues();
    const createdPolicy = {
      ...createdForm,
      profiles: [],
      conditions: [],
    };

    const getAllPolicies = () => {
      const policyNameExists = policies?.some(
        (policy) => policy.name === createdPolicy.name,
      );

      if (policyNameExists) {
        return policies?.map((policy) =>
          policy.name === createdPolicy.name ? createdPolicy : policy,
        );
      } else if (createdForm.name !== policyName) {
        return policies
          ?.filter((item) => item.name !== policyName)
          .concat(createdForm);
      }
      return policies?.concat(createdForm);
    };

    try {
      await adminClient.clientPolicies.updatePolicy({
        policies: getAllPolicies(),
      });
      addAlert(
        policyName
          ? t("updateClientPolicySuccess")
          : t("createClientPolicySuccess"),
        AlertVariant.success,
      );
      navigate(toEditClientPolicy({ realm, policyName: createdForm.name! }));
      setShowAddConditionsAndProfilesForm(true);
    } catch (error) {
      addError("createClientPolicyError", error);
    }
  };

  const [toggleDeleteDialog, DeleteConfirm] = useConfirmDialog({
    titleKey: t("deleteClientPolicyConfirmTitle"),
    messageKey: t("deleteClientPolicyConfirm", {
      policyName: policyName,
    }),
    continueButtonLabel: t("delete"),
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      const updatedPolicies = policies?.filter(
        (policy) => policy.name !== policyName,
      );

      try {
        await adminClient.clientPolicies.updatePolicy({
          policies: updatedPolicies,
        });
        addAlert(t("deleteClientPolicySuccess"), AlertVariant.success);
        navigate(
          toClientPolicies({
            realm,
            tab: "policies",
          }),
        );
      } catch (error) {
        addError(t("deleteClientPolicyError"), error);
      }
    },
  });

  const [toggleDeleteConditionDialog, DeleteConditionConfirm] =
    useConfirmDialog({
      titleKey: t("deleteClientPolicyConditionConfirmTitle"),
      messageKey: t("deleteClientPolicyConditionConfirm", {
        condition: conditionToDelete?.name,
      }),
      continueButtonLabel: t("delete"),
      continueButtonVariant: ButtonVariant.danger,
      onConfirm: async () => {
        if (conditionToDelete?.name) {
          currentPolicy?.conditions?.splice(conditionToDelete.idx!, 1);
          try {
            await adminClient.clientPolicies.updatePolicy({
              policies: policies,
            });
            addAlert(t("deleteConditionSuccess"), AlertVariant.success);
            navigate(
              toEditClientPolicy({ realm, policyName: formValues.name! }),
            );
          } catch (error) {
            addError(t("deleteConditionError"), error);
          }
        } else {
          const updatedPolicies = policies?.filter(
            (policy) => policy.name !== policyName,
          );

          try {
            await adminClient.clientPolicies.updatePolicy({
              policies: updatedPolicies,
            });
            addAlert(t("deleteClientSuccess"), AlertVariant.success);
            navigate(
              toClientPolicies({
                realm,
                tab: "policies",
              }),
            );
          } catch (error) {
            addError(t("deleteClientError"), error);
          }
        }
      },
    });

  const [toggleDeleteProfileDialog, DeleteProfileConfirm] = useConfirmDialog({
    titleKey: t("deleteClientPolicyProfileConfirmTitle"),
    messageKey: t("deleteClientPolicyProfileConfirm", {
      profileName: profileToDelete?.name,
      policyName,
    }),
    continueButtonLabel: t("delete"),
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      if (profileToDelete?.name) {
        currentPolicy?.profiles?.splice(profileToDelete.idx!, 1);
        try {
          await adminClient.clientPolicies.updatePolicy({
            policies: policies,
          });
          addAlert(t("deleteClientPolicyProfileSuccess"), AlertVariant.success);
          navigate(toEditClientPolicy({ realm, policyName: formValues.name! }));
        } catch (error) {
          addError(t("deleteClientPolicyProfileError"), error);
        }
      } else {
        const updatedPolicies = policies?.filter(
          (policy) => policy.name !== policyName,
        );

        try {
          await adminClient.clientPolicies.updatePolicy({
            policies: updatedPolicies,
          });
          addAlert(t("deleteClientSuccess"), AlertVariant.success);
          navigate(
            toClientPolicies({
              realm,
              tab: "policies",
            }),
          );
        } catch (error) {
          addError(t("deleteClientError"), error);
        }
      }
    },
  });

  const reset = () => {
    if (currentPolicy?.name !== undefined) {
      form.setValue("name", currentPolicy.name);
    }

    if (currentPolicy?.description !== undefined) {
      form.setValue("description", currentPolicy.description);
    }
  };

  const toggleModal = () => {
    setProfilesModalOpen(!profilesModalOpen);
  };

  const addProfiles = async (profiles: string[]) => {
    const createdPolicy = {
      ...currentPolicy,
      profiles: policyProfiles.concat(profiles),
      conditions: currentPolicy?.conditions,
    };

    const index = policies?.findIndex(
      (policy) => createdPolicy.name === policy.name,
    );

    if (index === undefined || index === -1) {
      return;
    }

    const newPolicies = [
      ...(policies || []).slice(0, index),
      createdPolicy,
      ...(policies || []).slice(index + 1),
    ];

    try {
      await adminClient.clientPolicies.updatePolicy({
        policies: newPolicies,
      });
      setPolicies(newPolicies);
      navigate(toEditClientPolicy({ realm, policyName: formValues.name! }));
      addAlert(t("addClientProfileSuccess"), AlertVariant.success);
    } catch (error) {
      addError("addClientProfileError", error);
    }
  };

  const [toggleDisableDialog, DisableConfirm] = useConfirmDialog({
    titleKey: "disablePolicyConfirmTitle",
    messageKey: "disablePolicyConfirm",
    continueButtonLabel: "disable",
    onConfirm: () => {
      form.setValue("enabled", !form.getValues().enabled);
      save();
    },
  });

  if (!policies) {
    return <KeycloakSpinner />;
  }

  return (
    <>
      <DeleteConditionConfirm />
      <DeleteProfileConfirm />
      <AddClientProfileModal
        onConfirm={(profiles: ClientProfileRepresentation[]) => {
          addProfiles(profiles.map((item) => item.name!));
        }}
        allProfiles={policyProfiles}
        open={profilesModalOpen}
        toggleDialog={toggleModal}
      />
      <Controller
        name="enabled"
        defaultValue={true}
        control={form.control}
        render={({ field }) => (
          <>
            <DisableConfirm />
            <DeleteConfirm />
            <ViewHeader
              titleKey={
                showAddConditionsAndProfilesForm || policyName
                  ? policyName
                  : "createPolicy"
              }
              divider
              dropdownItems={
                showAddConditionsAndProfilesForm || policyName
                  ? [
                      <DropdownItem
                        key="delete"
                        value="delete"
                        onClick={() => {
                          toggleDeleteDialog();
                        }}
                        data-testid="deleteClientPolicyDropdown"
                      >
                        {t("deleteClientPolicy")}
                      </DropdownItem>,
                    ]
                  : undefined
              }
              isEnabled={field.value}
              onToggle={(value) => {
                if (!value) {
                  toggleDisableDialog();
                } else {
                  field.onChange(value);
                  save();
                }
              }}
            />
          </>
        )}
      />
      <PageSection variant="light">
        <FormAccess
          onSubmit={handleSubmit(save)}
          isHorizontal
          role="view-realm"
          className="pf-v5-u-mt-lg"
        >
          <FormProvider {...form}>
            <TextControl
              name="name"
              label={t("name")}
              rules={{
                required: { value: true, message: t("required") },
                validate: (value) =>
                  policies.some((policy) => policy.name === value)
                    ? t("createClientProfileNameHelperText").toString()
                    : true,
              }}
            />
            <FormGroup label={t("description")} fieldId="kc-description">
              <KeycloakTextArea
                aria-label={t("description")}
                id="kc-client-policy-description"
                data-testid="client-policy-description"
                {...form.register("description")}
              />
            </FormGroup>
            <ActionGroup>
              <Button
                variant="primary"
                type="submit"
                data-testid="saveCreatePolicy"
                isDisabled={!form.formState.isValid}
              >
                {t("save")}
              </Button>
              <Button
                id="cancelCreatePolicy"
                variant="link"
                onClick={() =>
                  showAddConditionsAndProfilesForm || policyName
                    ? reset()
                    : navigate(
                        toClientPolicies({
                          realm,
                          tab: "policies",
                        }),
                      )
                }
                data-testid="cancelCreatePolicy"
              >
                {showAddConditionsAndProfilesForm ? t("reload") : t("cancel")}
              </Button>
            </ActionGroup>
            {(showAddConditionsAndProfilesForm ||
              form.formState.isSubmitted) && (
              <>
                <Flex>
                  <FlexItem>
                    <Text className="kc-conditions" component={TextVariants.h1}>
                      {t("conditions")}
                      <HelpItem
                        helpText={t("conditionsHelp")}
                        fieldLabelId="conditions"
                      />
                    </Text>
                  </FlexItem>
                  <FlexItem align={{ default: "alignRight" }}>
                    <Button
                      id="addCondition"
                      component={(props) => (
                        <Link
                          {...props}
                          to={toNewClientPolicyCondition({
                            realm,
                            policyName: policyName!,
                          })}
                        ></Link>
                      )}
                      variant="link"
                      className="kc-addCondition"
                      data-testid="addCondition"
                      icon={<PlusCircleIcon />}
                    >
                      {t("addCondition")}
                    </Button>
                  </FlexItem>
                </Flex>
                {policyConditions.length > 0 ? (
                  <DataList aria-label={t("conditions")} isCompact>
                    {policyConditions.map((condition, idx) => (
                      <DataListItem
                        aria-labelledby="conditions-list-item"
                        key={`list-item-${idx}`}
                        id={condition.condition}
                        data-testid="conditions-list-item"
                      >
                        <DataListItemRow data-testid="conditions-list-row">
                          <DataListItemCells
                            dataListCells={[
                              <DataListCell
                                key={`name-${idx}`}
                                data-testid="condition-type"
                              >
                                {Object.keys(condition.configuration!)
                                  .length !== 0 ? (
                                  <Link
                                    key={condition.condition}
                                    data-testid={`${condition.condition}-condition-link`}
                                    to={toEditClientPolicyCondition({
                                      realm,
                                      conditionName: condition.condition!,
                                      policyName: policyName,
                                    })}
                                    className="kc-condition-link"
                                  >
                                    {condition.condition}
                                  </Link>
                                ) : (
                                  condition.condition
                                )}
                                {conditionTypes?.map(
                                  (type) =>
                                    type.id === condition.condition && (
                                      <>
                                        <HelpItem
                                          helpText={type.helpText}
                                          fieldLabelId={condition.condition}
                                        />
                                        <Button
                                          variant="link"
                                          aria-label="remove-condition"
                                          isInline
                                          icon={
                                            <TrashIcon
                                              className="kc-conditionType-trash-icon"
                                              data-testid={`delete-${condition.condition}-condition`}
                                              onClick={() => {
                                                toggleDeleteConditionDialog();
                                                setConditionToDelete({
                                                  idx: idx,
                                                  name: type.id!,
                                                });
                                              }}
                                            />
                                          }
                                        ></Button>
                                      </>
                                    ),
                                )}
                              </DataListCell>,
                            ]}
                          />
                        </DataListItemRow>
                      </DataListItem>
                    ))}
                  </DataList>
                ) : (
                  <>
                    <Divider />
                    <Text
                      className="kc-emptyConditions"
                      component={TextVariants.h2}
                    >
                      {t("emptyConditions")}
                    </Text>
                  </>
                )}
              </>
            )}
            {(showAddConditionsAndProfilesForm ||
              form.formState.isSubmitted) && (
              <>
                <Flex>
                  <FlexItem>
                    <Text
                      className="kc-client-profiles"
                      component={TextVariants.h1}
                    >
                      {t("clientProfiles")}
                      <HelpItem
                        helpText={t("clientProfilesHelp")}
                        fieldLabelId="clientProfiles"
                      />
                    </Text>
                  </FlexItem>
                  <FlexItem align={{ default: "alignRight" }}>
                    <Button
                      id="addClientProfile"
                      variant="link"
                      className="kc-addClientProfile"
                      data-testid="addClientProfile"
                      icon={<PlusCircleIcon />}
                      onClick={toggleModal}
                    >
                      {t("addClientProfile")}
                    </Button>
                  </FlexItem>
                </Flex>
                {policyProfiles.length > 0 ? (
                  <DataList aria-label={t("profiles")} isCompact>
                    {policyProfiles.map((profile, idx) => (
                      <DataListItem
                        aria-labelledby={`${profile}-profile-list-item`}
                        key={profile}
                        id={`${profile}-profile-list-item`}
                        data-testid={"profile-list-item"}
                      >
                        <DataListItemRow data-testid="profile-list-row">
                          <DataListItemCells
                            dataListCells={[
                              <DataListCell
                                key="name"
                                data-testid="profile-name"
                              >
                                {profile && (
                                  <Link
                                    key={profile}
                                    data-testid="profile-name-link"
                                    to={toClientProfile({
                                      realm,
                                      profileName: profile,
                                    })}
                                    className="kc-profile-link"
                                  >
                                    {profile}
                                  </Link>
                                )}
                                {policyProfiles
                                  .filter((type) => type === profile)
                                  .map((type) => (
                                    <>
                                      <HelpItem
                                        helpText={
                                          clientProfiles.find(
                                            (profile) => type === profile.name,
                                          )?.description
                                        }
                                        fieldLabelId={profile}
                                      />
                                      <Button
                                        variant="link"
                                        aria-label="remove-client-profile"
                                        isInline
                                        icon={
                                          <TrashIcon
                                            className="kc-conditionType-trash-icon"
                                            data-testid="deleteClientProfileDropdown"
                                            onClick={() => {
                                              toggleDeleteProfileDialog();
                                              setProfileToDelete({
                                                idx: idx,
                                                name: type!,
                                              });
                                            }}
                                          />
                                        }
                                      ></Button>
                                    </>
                                  ))}
                              </DataListCell>,
                            ]}
                          />
                        </DataListItemRow>
                      </DataListItem>
                    ))}
                  </DataList>
                ) : (
                  <>
                    <Divider />
                    <Text
                      className="kc-emptyClientProfiles"
                      component={TextVariants.h2}
                    >
                      {t("emptyProfiles")}
                    </Text>
                  </>
                )}
              </>
            )}
          </FormProvider>
        </FormAccess>
      </PageSection>
    </>
  );
}
