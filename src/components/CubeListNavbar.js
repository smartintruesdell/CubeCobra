import React, { useCallback, useContext, useState } from 'react';
import PropTypes from 'prop-types';
import CardPropType from 'proptypes/CardPropType';

import {
  Button,
  Collapse,
  Col,
  Container,
  CustomInput,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Form,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Navbar,
  NavbarToggler,
  Row,
  UncontrolledDropdown,
  FormGroup,
} from 'reactstrap';

import CardModalContext from 'contexts/CardModalContext';
import CSRFForm from 'components/CSRFForm';
import CubeContext from 'contexts/CubeContext';
import DisplayContext from 'contexts/DisplayContext';
import EditCollapse from 'components/EditCollapse';
import FilterCollapse from 'components/FilterCollapse';
import GroupModalContext from 'contexts/GroupModalContext';
import SortCollapse from 'components/SortCollapse';
import SortContext from 'contexts/SortContext';
import TagColorsModal from 'components/TagColorsModal';
import withModal from 'components/WithModal';
import { QuestionIcon } from '@primer/octicons-react';
import Tooltip from 'components/Tooltip';

const PasteBulkModal = ({ isOpen, toggle }) => {
  const { cubeID } = useContext(CubeContext);
  return (
    <Modal isOpen={isOpen} toggle={toggle} labelledBy="pasteBulkModalTitle">
      <ModalHeader id="pasteBulkModalTitle" toggle={toggle}>
        Bulk Upload - Paste Text
      </ModalHeader>
      <CSRFForm method="POST" action={`/cube/bulkupload/${cubeID}`}>
        <ModalBody>
          <p>
            Acceptable formats are:
            <br />• one card name per line, or
            <br />• one card name per line prepended with #x, such as &quot;2x island&quot;
          </p>
          <Input
            type="textarea"
            maxLength="20000"
            rows="10"
            placeholder="Paste Cube Here (max length 20000)"
            name="body"
          />
        </ModalBody>
        <ModalFooter>
          <Button color="success" type="submit">
            Upload
          </Button>
          <Button color="secondary" onClick={toggle}>
            Close
          </Button>
        </ModalFooter>
      </CSRFForm>
    </Modal>
  );
};

PasteBulkModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
};

const PasteBulkModalItem = withModal(DropdownItem, PasteBulkModal);

const UploadBulkModal = ({ isOpen, toggle }) => {
  const { cubeID } = useContext(CubeContext);
  return (
    <Modal isOpen={isOpen} toggle={toggle} labelledBy="uploadBulkModalTitle">
      <ModalHeader id="uploadBulkModalTitle" toggle={toggle}>
        Bulk Upload - Upload File
      </ModalHeader>
      <CSRFForm method="POST" action={`/cube/bulkuploadfile/${cubeID}`} encType="multipart/form-data">
        <ModalBody>
          <p>
            Acceptable files are:
            <br />• .txt (plaintext) with one card name per line, or
            <br />• .csv with the same format as our .csv export (columns may be omitted and re-arranged, default values
            may be used).
          </p>
          <CustomInput type="file" id="uploadBulkFile" name="document" />
          <Label for="uploadBulkFile" className="sr-only">
            Choose file
          </Label>
        </ModalBody>
        <ModalFooter>
          <Button color="success" type="submit">
            Upload
          </Button>
          <Button color="secondary" onClick={toggle}>
            Close
          </Button>
        </ModalFooter>
      </CSRFForm>
    </Modal>
  );
};

UploadBulkModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
};

const UploadBulkModalItem = withModal(DropdownItem, UploadBulkModal);

const UploadBulkReplaceModal = ({ isOpen, toggle }) => {
  const { cubeID } = useContext(CubeContext);
  return (
    <Modal isOpen={isOpen} toggle={toggle} labelledBy="uploadReplacementModalTitle">
      <ModalHeader id="uploadReplacementModalTitle" toggle={toggle}>
        Bulk Upload - Replace with CSV File Upload
      </ModalHeader>
      <CSRFForm method="POST" action={`/cube/bulkreplacefile/${cubeID}`} encType="multipart/form-data">
        <ModalBody>
          <p>
            Replaces all cards in your cube and Maybeboard. Acceptable files are .csv files with the exact format as our
            .csv export.
          </p>
          <CustomInput type="file" id="uploadReplacementFile" name="document" />
          <Label for="uploadReplacementFile" className="sr-only">
            Choose file
          </Label>
        </ModalBody>
        <ModalFooter>
          <Button color="success" type="submit">
            Upload
          </Button>
          <Button color="secondary" onClick={toggle}>
            Close
          </Button>
        </ModalFooter>
      </CSRFForm>
    </Modal>
  );
};

UploadBulkReplaceModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
};

const UploadBulkReplaceModalItem = withModal(DropdownItem, UploadBulkReplaceModal);

const SelectEmptyModal = ({ isOpen, toggle }) => (
  <Modal isOpen={isOpen} toggle={toggle} labelledBy="selectEmptyTitle">
    <ModalHeader id="selectEmptyTitle" toggle={toggle}>
      Cannot Edit Selected
    </ModalHeader>
    <ModalBody>
      <p className="mb-0">
        No cards are selected. To select and edit multiple cards, use the 'List View' and check the desired cards.
      </p>
    </ModalBody>
    <ModalFooter>
      <Button color="secondary" onClick={toggle}>
        Close
      </Button>
    </ModalFooter>
  </Modal>
);

SelectEmptyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
};

const CompareCollapse = (props) => {
  const { cubeID } = useContext(CubeContext);
  const [compareID, setCompareID] = useState('');
  const handleChange = useCallback((event) => setCompareID(event.target.value), []);

  const targetUrl = `/cube/compare/${cubeID}/to/${compareID}`;

  return (
    <Collapse {...props}>
      <Container>
        <Row>
          <Col>
            <Form method="GET" action={targetUrl} inline>
              <Input
                type="text"
                className="mb-2 mr-2"
                placeholder="Comparison Cube ID"
                value={compareID}
                onChange={handleChange}
              />
              <Button color="success" className="mb-2" href={targetUrl}>
                Compare Cubes
              </Button>
            </Form>
          </Col>
        </Row>
      </Container>
    </Collapse>
  );
};

const CubeListNavbar = ({
  cards,
  cubeView,
  setCubeView,
  openCollapse,
  setOpenCollapse,
  defaultPrimarySort,
  defaultSecondarySort,
  defaultTertiarySort,
  defaultQuaternarySort,
  defaultShowUnsorted,
  sorts,
  setSorts,
  defaultSorts,
  cubeDefaultShowUnsorted,
  defaultFilterText,
  filter,
  setFilter,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tagColorsModalOpen, setTagColorsModalOpen] = useState(false);
  const [selectEmptyModalOpen, setSelectEmptyModalOpen] = useState(false);
  const [isSortUsed, setIsSortUsed] = useState(true);
  const [isFilterUsed, setIsFilterUsed] = useState(true);

  const { canEdit, cubeID, hasCustomImages } = useContext(CubeContext);
  const { groupModalCards, openGroupModal } = useContext(GroupModalContext);
  const { primary, secondary, tertiary, quaternary, showOther, changeSort } = useContext(SortContext);
  const openCardModal = useContext(CardModalContext);
  const {
    showCustomImages,
    toggleShowCustomImages,
    compressedView,
    toggleCompressedView,
    showMaybeboard,
    toggleShowMaybeboard,
  } = useContext(DisplayContext);

  const toggle = useCallback(() => setIsOpen((open) => !open), []);

  const handleChangeCubeView = useCallback(
    (event) => {
      const { target } = event;
      const { value } = target;
      setCubeView(value);
    },
    [setCubeView],
  );

  const handleMassEdit = useCallback(
    (event) => {
      event.preventDefault();
      if (cubeView === 'list') {
        if (groupModalCards.length === 0) {
          setSelectEmptyModalOpen(true);
        } else if (groupModalCards.length === 1) {
          openCardModal(groupModalCards[0]);
        } else if (groupModalCards.length > 1) {
          openGroupModal();
        }
      } else {
        setCubeView('list');
      }
    },
    [groupModalCards, openCardModal, openGroupModal, cubeView, setCubeView],
  );

  const handleOpenCollapse = useCallback(
    (event) => {
      event.preventDefault();
      const { target } = event;
      const collapse = target.getAttribute('data-target');
      // Avoid shadowing the openCollapse prop
      setOpenCollapse((openCollapseArg) => (openCollapseArg === collapse ? null : collapse));
    },
    [setOpenCollapse],
  );

  const handleOpenTagColorsModal = useCallback(() => setTagColorsModalOpen(true), []);
  const handleToggleTagColorsModal = useCallback(() => setTagColorsModalOpen(false), []);
  const handleToggleSelectEmptyModal = useCallback(() => setSelectEmptyModalOpen(false), []);

  const enc = encodeURIComponent;
  const sortUrlSegment = `primary=${enc(primary)}&secondary=${enc(secondary)}&tertiary=${enc(
    tertiary,
  )}&quaternary=${enc(quaternary)}&showother=${enc(showOther)}`;
  const filterString = filter?.stringify ?? '';
  const filterUrlSegment = filterString ? `&filter=${enc(filterString)}` : '';
  const urlSegment = `${isSortUsed ? sortUrlSegment : ''}${isFilterUsed ? filterUrlSegment : ''}`;

  return (
    <div className={`usercontrols${className ? ` ${className}` : ''}`}>
      <Navbar expand="md" className="navbar-light">
        <div className="d-flex flex-row flex-nowrap justify-content-between" style={{ flexGrow: 1 }}>
          <div className="view-style-select">
            <Label className="sr-only" for="viewSelect">
              Cube View Style
            </Label>
            <Input type="select" id="viewSelect" value={cubeView} onChange={handleChangeCubeView}>
              <option value="table">Table View</option>
              <option value="spoiler">Visual Spoiler</option>
              {!canEdit ? '' : <option value="list">List View</option>}
              <option value="curve">Curve View</option>
            </Input>
          </div>
          <NavbarToggler onClick={toggle} />
        </div>
        <Collapse isOpen={isOpen} navbar>
          <Nav className="ml-auto" navbar>
            {!canEdit ? (
              ''
            ) : (
              <NavItem>
                <NavLink href="#" data-target="edit" onClick={handleOpenCollapse}>
                  Add/Remove
                </NavLink>
              </NavItem>
            )}
            <NavItem>
              <NavLink href="#" data-target="sort" onClick={handleOpenCollapse}>
                Sort
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="#" data-target="filter" onClick={handleOpenCollapse}>
                Filter
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="#" data-target="compare" onClick={handleOpenCollapse}>
                Compare
              </NavLink>
            </NavItem>
            {!canEdit ? (
              ''
            ) : (
              <NavItem className={cubeView === 'list' ? undefined : 'd-none d-lg-block'}>
                <NavLink href="#" onClick={handleMassEdit}>
                  {cubeView === 'list' ? 'Edit Selected' : 'Mass Edit'}
                </NavLink>
              </NavItem>
            )}
            <UncontrolledDropdown nav inNavbar>
              <DropdownToggle nav caret>
                Display
              </DropdownToggle>
              <DropdownMenu right>
                <DropdownItem onClick={handleOpenTagColorsModal}>
                  {canEdit ? 'Set Tag Colors' : 'View Tag Colors'}
                </DropdownItem>
                {!hasCustomImages && (
                  <DropdownItem onClick={toggleShowCustomImages}>
                    {showCustomImages ? 'Hide Custom Images' : 'Show Custom Images'}
                  </DropdownItem>
                )}
                <DropdownItem onClick={toggleCompressedView}>
                  {compressedView ? 'Disable Compressed View' : 'Enable Compressed View'}
                </DropdownItem>
                <DropdownItem onClick={toggleShowMaybeboard}>
                  {showMaybeboard ? 'Hide Maybeboard' : 'Show Maybeboard'}
                </DropdownItem>
                <DropdownItem onClick={() => changeSort({ showOther: !showOther })}>
                  {showOther ? 'Hide Unsorted Cards' : 'Show Unsorted Cards'}
                </DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
            <UncontrolledDropdown nav inNavbar>
              <DropdownToggle nav caret>
                {canEdit ? 'Import/Export' : 'Export'}
              </DropdownToggle>
              <DropdownMenu right>
                {canEdit && (
                  <>
                    <DropdownItem disabled>Import</DropdownItem>
                    <PasteBulkModalItem>Paste Text</PasteBulkModalItem>
                    <UploadBulkModalItem>Upload File</UploadBulkModalItem>
                    <UploadBulkReplaceModalItem>Replace with CSV File Upload</UploadBulkReplaceModalItem>
                    <DropdownItem divider />
                    <DropdownItem disabled>Export</DropdownItem>
                  </>
                )}
                <DropdownItem href={`/cube/clone/${cubeID}`}>Clone Cube</DropdownItem>
                <DropdownItem href={`/cube/download/plaintext/${cubeID}?${urlSegment}`}>Card Names (.txt)</DropdownItem>
                <DropdownItem href={`/cube/download/csv/${cubeID}?${urlSegment}`}>Comma-Separated (.csv)</DropdownItem>
                <DropdownItem href={`/cube/download/forge/${cubeID}?${urlSegment}`}>Forge (.dck)</DropdownItem>
                <DropdownItem href={`/cube/download/mtgo/${cubeID}?${urlSegment}`}>MTGO (.txt)</DropdownItem>
                <DropdownItem href={`/cube/download/xmage/${cubeID}?${urlSegment}`}>XMage (.dck)</DropdownItem>
                <DropdownItem divider />
                <DropdownItem toggle={false} onClick={() => setIsSortUsed((is) => !is)}>
                  <FormGroup check style={{ display: 'flex' }}>
                    <Input type="checkbox" checked={isSortUsed} onChange={() => {}} /> Use Sort
                    <Tooltip text="Order export using current sort options." wrapperTag="span" className="ml-auto mr-0">
                      <QuestionIcon size={16} />
                    </Tooltip>
                  </FormGroup>
                </DropdownItem>
                <DropdownItem toggle={false} onClick={() => setIsFilterUsed((is) => !is)}>
                  <FormGroup check style={{ display: 'flex' }}>
                    <Input type="checkbox" checked={isFilterUsed} onChange={() => {}} /> Use Filter
                    <Tooltip
                      text="Include in export only cards matching current filter."
                      wrapperTag="span"
                      className="ml-auto mr-0"
                    >
                      <QuestionIcon size={16} />
                    </Tooltip>
                  </FormGroup>
                </DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
          </Nav>
        </Collapse>
      </Navbar>
      {!canEdit ? '' : <EditCollapse isOpen={openCollapse === 'edit'} cubeView={cubeView} />}
      <SortCollapse
        defaultPrimarySort={defaultPrimarySort}
        defaultSecondarySort={defaultSecondarySort}
        defaultTertiarySort={defaultTertiarySort}
        defaultQuaternarySort={defaultQuaternarySort}
        defaultShowUnsorted={defaultShowUnsorted}
        sorts={sorts}
        setSorts={setSorts}
        defaultSorts={defaultSorts}
        cubeDefaultShowUnsorted={cubeDefaultShowUnsorted}
        isOpen={openCollapse === 'sort'}
      />
      <FilterCollapse
        defaultFilterText={defaultFilterText}
        filter={filter}
        setFilter={setFilter}
        numCards={cards.length}
        isOpen={openCollapse === 'filter'}
      />
      <CompareCollapse isOpen={openCollapse === 'compare'} />
      <TagColorsModal canEdit={canEdit} isOpen={tagColorsModalOpen} toggle={handleToggleTagColorsModal} />
      <SelectEmptyModal isOpen={selectEmptyModalOpen} toggle={handleToggleSelectEmptyModal} />
    </div>
  );
};

CubeListNavbar.propTypes = {
  cards: PropTypes.arrayOf(CardPropType).isRequired,
  cubeView: PropTypes.string.isRequired,
  setCubeView: PropTypes.func.isRequired,
  openCollapse: PropTypes.string,
  setOpenCollapse: PropTypes.func.isRequired,
  defaultPrimarySort: PropTypes.string.isRequired,
  defaultSecondarySort: PropTypes.string.isRequired,
  defaultTertiarySort: PropTypes.string.isRequired,
  defaultQuaternarySort: PropTypes.string.isRequired,
  defaultShowUnsorted: PropTypes.string.isRequired,
  sorts: PropTypes.arrayOf(PropTypes.string),
  setSorts: PropTypes.func.isRequired,
  defaultSorts: PropTypes.arrayOf(PropTypes.string).isRequired,
  cubeDefaultShowUnsorted: PropTypes.bool,
  defaultFilterText: PropTypes.string.isRequired,
  filter: PropTypes.func,
  setFilter: PropTypes.func.isRequired,
  className: PropTypes.string,
};

CubeListNavbar.defaultProps = {
  openCollapse: null,
  sorts: null,
  filter: null,
  className: null,
  cubeDefaultShowUnsorted: false,
};

export default CubeListNavbar;
